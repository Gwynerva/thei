import {
  defaultRangeExtractor,
  useWindowVirtualizer,
  type VirtualItem,
} from '@tanstack/vue-virtual';
import type { Ref } from 'vue';
import type { LifeWindowResponse } from '../../shared/life';
import { selectActiveLifeDay } from '../../shared/life-timeline';
import {
  cacheLifeWindow,
  cachedLifeDays,
  evictLifeWindows,
  lifeFeedRows,
  LIFE_SSR_ROWS,
  type LifeCachedWindow,
  type LifeWindowRequest,
  type LifeFeedRow,
} from './life-window-cache';

export function useLifeFeed(
  initial: LifeWindowResponse,
  period: string | undefined,
  root: Ref<HTMLElement | null>,
) {
  const windows = shallowRef([cacheLifeWindow(initial, { period })]);
  const rows = computed(() => lifeFeedRows(windows.value));
  const days = computed(() => cachedLifeDays(windows.value));
  const activeDate = ref(initial.anchorDate);
  const newestDate = ref(initial.newestDate);
  const mounted = ref(false);
  const positioned = ref(!period);
  const scrollMargin = ref(0);
  const scrollPaddingStart = ref(0);
  const focusedKey = ref<string>();
  const errors = reactive<Record<string, boolean>>({});
  const pending = reactive(new Set<string>());
  const sizes = new Map<string, number>();
  const requests = new Map<string, AbortController>();
  let generation = 0;
  let frame: number | undefined;
  let geometryFrame: number | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let disposed = false;
  let commits: Promise<void> = Promise.resolve();
  let initialPosition = period ? initial.anchorDate : undefined;
  const activeDay = computed(
    () =>
      days.value.find((day) => day.date === activeDate.value) ?? days.value[0],
  );
  const cachedWindowCount = computed(
    () => windows.value.filter((window) => window.data).length,
  );
  const windowCount = computed(() => windows.value.length);
  const newerCursor = computed(() => windows.value[0]?.newerCursor);
  const olderCursor = computed(() => windows.value.at(-1)?.olderCursor);
  const estimate = (row: LifeFeedRow) =>
    sizes.get(row.key) ??
    (row.kind === 'window' ? row.height : row.kind === 'gap' ? 48 : 300);
  const virtualizer = useWindowVirtualizer<HTMLElement>(
    computed(() => ({
      enabled: mounted.value,
      count: rows.value.length,
      getItemKey: (index: number) => rows.value[index]!.key,
      estimateSize: (index: number) => estimate(rows.value[index]!),
      overscan: 6,
      useAnimationFrameWithResizeObserver: true,
      scrollMargin: scrollMargin.value,
      scrollPaddingStart: scrollPaddingStart.value,
      rangeExtractor: (range) => {
        const indices = defaultRangeExtractor(range);
        const focused = rows.value.findIndex(
          (row) => row.key === focusedKey.value,
        );
        if (focused >= 0 && !indices.includes(focused)) indices.push(focused);
        return indices.sort((a, b) => a - b);
      },
      measureElement: (element: HTMLElement) => {
        const height = element.getBoundingClientRect().height;
        const key = element.dataset.lifeKey;
        if (key) sizes.set(key, height);
        return height;
      },
      onChange: () => schedule(),
    })),
  );
  const visibleRows = computed(() =>
    mounted.value
      ? virtualizer.value
          .getVirtualItems()
          .map((item) => ({ row: rows.value[item.index]!, item }))
      : rows.value.slice(0, LIFE_SSR_ROWS).map((row, index) => ({
          row,
          item: {
            index,
            key: row.key,
            start: 0,
            size: 0,
            end: 0,
            lane: 0,
          } satisfies VirtualItem,
        })),
  );
  const totalSize = computed(() =>
    mounted.value ? virtualizer.value.getTotalSize() : undefined,
  );

  function trackerBottom() {
    return (
      document
        .querySelector<HTMLElement>('[data-life-period-tracker]')
        ?.getBoundingClientRect().bottom ?? 0
    );
  }
  function viewportItems() {
    const top = window.scrollY + trackerBottom();
    return virtualizer.value
      .getVirtualItems()
      .filter(
        (item) =>
          item.end > top && item.start < window.scrollY + window.innerHeight,
      );
  }
  function anchor() {
    const item = viewportItems().find(
      (item) => rows.value[item.index]?.kind === 'point',
    );
    return item
      ? { key: String(item.key), offset: item.start - window.scrollY }
      : undefined;
  }
  function schedule() {
    if (!mounted.value || disposed || frame !== undefined) return;
    frame = requestAnimationFrame(updateViewport);
  }
  function updateViewport() {
    frame = undefined;
    if (!positioned.value || disposed) return;
    const items = viewportItems();
    const date = selectActiveLifeDay(
      items.flatMap((item) => {
        const row = rows.value[item.index];
        return row?.kind === 'point'
          ? [
              {
                date: row.date,
                top: item.start - window.scrollY,
                bottom: item.end - window.scrollY,
              },
            ]
          : [];
      }),
      trackerBottom(),
      window.innerHeight,
    );
    if (date) activeDate.value = date;
    for (const item of virtualizer.value.getVirtualItems()) {
      const row = rows.value[item.index];
      if (row?.kind === 'window' && !errors[row.windowId])
        void reloadWindow(row.windowId);
    }
    if (items.some((item) => item.index < 4) && !errors.newer)
      void load('newer');
    if (
      items.some((item) => item.index >= rows.value.length - 4) &&
      !errors.older
    )
      void load('older');
  }
  function syncGeometry() {
    if (!root.value) return;
    scrollMargin.value =
      root.value.getBoundingClientRect().top + window.scrollY;
    schedule();
  }
  function measure(element: Element | null) {
    if (!element) {
      // Vue clears a ref just before removing its DOM node. Prune after removal
      // so the virtualizer can disconnect observers for recycled rows.
      void nextTick(() => {
        if (!disposed) virtualizer.value.measureElement(null);
      });
      return;
    }
    if (!(element instanceof HTMLElement)) return;
    if (mounted.value) virtualizer.value.measureElement(element);
    else if (element.dataset.lifeKey)
      sizes.set(
        element.dataset.lifeKey,
        element.getBoundingClientRect().height,
      );
  }
  function focusChanged() {
    const element =
      document.activeElement?.closest<HTMLElement>('[data-life-key]');
    focusedKey.value =
      element && root.value?.contains(element)
        ? element.dataset.lifeKey
        : undefined;
  }

  async function commit(next: LifeCachedWindow[], incomingId?: string) {
    const commitGeneration = generation;
    const savedAnchor = anchor();
    const current = rows.value;
    const heights = new Map<string, number>();
    for (const row of current)
      heights.set(
        row.windowId,
        (heights.get(row.windowId) ?? 0) + estimate(row),
      );
    const activeId =
      current.find((row) => row.key === savedAnchor?.key)?.windowId ??
      incomingId ??
      next[0]!.id;
    const focusedId = current.find(
      (row) => row.key === focusedKey.value,
    )?.windowId;
    const protectedIds = new Set(
      [incomingId, focusedId].filter((id): id is string => Boolean(id)),
    );
    evictLifeWindows(next, activeId, protectedIds, heights);
    windows.value = next;
    const retained = new Set(rows.value.map((row) => row.key));
    for (const key of sizes.keys()) if (!retained.has(key)) sizes.delete(key);
    // Clear the library's per-key history when rows leave the data cache.
    // Our bounded measurements seed the next layout through estimateSize.
    virtualizer.value.measure();
    await nextTick();
    if (disposed || generation !== commitGeneration) return;
    syncGeometry();
    if (savedAnchor) {
      const index = rows.value.findIndex((row) => row.key === savedAnchor.key);
      const offset =
        index < 0
          ? undefined
          : scrollMargin.value +
            rows.value
              .slice(0, index)
              .reduce((height, row) => height + estimate(row), 0);
      if (offset !== undefined)
        window.scrollTo({ top: offset - savedAnchor.offset, behavior: 'auto' });
    }
    schedule();
  }

  async function fetchWindow(
    key: string,
    query: LifeWindowRequest,
    apply: (result: LifeWindowResponse) => Promise<void>,
  ) {
    if (pending.has(key) || disposed) return;
    const requestGeneration = generation;
    const controller = new AbortController();
    requests.set(key, controller);
    pending.add(key);
    delete errors[key];
    try {
      const result = await $fetch<LifeWindowResponse>('/api/life', {
        query,
        signal: controller.signal,
        retry: 0,
      });
      if (requestGeneration !== generation || disposed) return;
      newestDate.value = result.newestDate;
      const commit = commits.then(async () => {
        if (requestGeneration === generation && !disposed) await apply(result);
      });
      commits = commit.catch(() => {});
      await commit;
    } catch {
      if (!controller.signal.aborted && requestGeneration === generation)
        errors[key] = true;
    } finally {
      if (requests.get(key) === controller) {
        requests.delete(key);
        pending.delete(key);
      }
    }
  }
  async function load(direction: 'newer' | 'older') {
    const cursor =
      direction === 'newer' ? newerCursor.value : olderCursor.value;
    if (!cursor || !positioned.value) return;
    const request = { cursor, direction };
    await fetchWindow(direction, request, async (result) => {
      const incoming = cacheLifeWindow(result, request);
      if (windows.value.some((window) => window.id === incoming.id)) return;
      const next = windows.value.map((window) => ({ ...window }));
      if (direction === 'newer') next.unshift(incoming);
      else next.push(incoming);
      await commit(next, incoming.id);
    });
  }
  async function reloadWindow(id: string) {
    const cached = windows.value.find((window) => window.id === id);
    if (!cached || cached.data) return;
    await fetchWindow(id, cached.request, async (result) => {
      await commit(
        windows.value.map((window) =>
          window.id === id ? { ...window, data: result } : { ...window },
        ),
        id,
      );
    });
  }
  function cancel() {
    generation++;
    requests.forEach((request) => request.abort());
    requests.clear();
    pending.clear();
    for (const key of Object.keys(errors)) delete errors[key];
  }
  async function positionAt(date: string) {
    const positionGeneration = generation;
    positioned.value = false;
    activeDate.value = date;
    await nextTick();
    if (disposed || generation !== positionGeneration) return;
    syncGeometry();
    const index = rows.value.findIndex(
      (row) => row.date === date && row.kind === 'point',
    );
    if (index >= 0) {
      virtualizer.value.scrollToIndex(index, { align: 'start' });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (disposed || generation !== positionGeneration) return;
      scrollPaddingStart.value = trackerBottom();
      await nextTick();
      if (disposed || generation !== positionGeneration) return;
      virtualizer.value.scrollToIndex(index, { align: 'start' });
    }
    positioned.value = true;
    schedule();
  }
  async function reset(data: LifeWindowResponse, period?: string) {
    cancel();
    focusedKey.value = undefined;
    positioned.value = false;
    sizes.clear();
    windows.value = [cacheLifeWindow(data, { period })];
    newestDate.value = data.newestDate;
    virtualizer.value.measure();
    await positionAt(data.anchorDate);
  }
  onMounted(async () => {
    syncGeometry();
    mounted.value = true;
    await nextTick();
    if (disposed) return;
    resizeObserver = new ResizeObserver(() => {
      if (geometryFrame !== undefined) return;
      geometryFrame = requestAnimationFrame(() => {
        geometryFrame = undefined;
        syncGeometry();
      });
    });
    if (root.value) resizeObserver.observe(root.value);
    window.addEventListener('resize', syncGeometry, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('focusout', focusChanged);
    if (initialPosition) await positionAt(initialPosition);
    initialPosition = undefined;
    schedule();
  });
  onBeforeUnmount(() => {
    disposed = true;
    cancel();
    resizeObserver?.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (geometryFrame !== undefined) cancelAnimationFrame(geometryFrame);
    window.removeEventListener('resize', syncGeometry);
    window.removeEventListener('scroll', schedule);
    document.removeEventListener('focusin', focusChanged);
    document.removeEventListener('focusout', focusChanged);
    sizes.clear();
  });
  return {
    days,
    activeDate,
    activeDay,
    newestDate,
    positioned,
    mounted,
    visibleRows,
    totalSize,
    scrollMargin,
    cachedWindowCount,
    windowCount,
    errors,
    pending,
    newerCursor,
    olderCursor,
    measure,
    load,
    reloadWindow,
    reset,
    cancel,
  };
}
