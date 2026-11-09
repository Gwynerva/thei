import type { MaybeRefOrGetter } from 'vue';
import {
  activeHeadingIndex,
  headingActivations,
} from '#layers/thei/app/components/content/content-headings-active';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';

interface MeasuredEntry {
  /** Where the heading stands in the table of contents. */
  item: number;
  top: number;
  height: number;
}

/**
 * The entry of a table of contents the reader is in now, for the sidebar to
 * light up (`content-headings-active.ts` decides it from the layout).
 *
 * The headings are looked for inside `root` alone: while one page gives way to
 * another, both may hold the same ids. Where they stand is measured once and
 * kept until the layout changes — the page or the window resized, pictures
 * loaded, a spoiler opened, relations loaded, the sticky bars grown — so
 * scrolling measures nothing and only looks its position up.
 *
 * While a modal or an overlay holds the page still (`overflow` of the root
 * clipped, `Modal.vue`), nothing is measured and the entry stays: the page
 * behind it has not moved, and the modal puts it back where it was.
 *
 * An entry followed by a link — in the table of contents, in the phone's
 * sheet, or anywhere on the page — is current at once, though a heading near
 * the end of the page may never scroll up to its place, until the reader
 * scrolls, points or presses a key again.
 */
export function useActiveContentHeading(
  root: Readonly<Ref<HTMLElement | null | undefined>>,
  items: MaybeRefOrGetter<readonly ContentHeading[]>,
) {
  const active = shallowRef<string>();
  if (import.meta.server) return active;

  const stickyHeader = useStickyHeaderContext();
  const isAdmin = useIsAdmin();

  let entries: MeasuredEntry[] = [];
  let activations: number[] = [];
  let maxScroll = 0;
  let dirty = true;
  let frame = 0;
  let pinned: string | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let listening = false;

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function invalidate() {
    dirty = true;
    schedule();
  }

  function pageHeldStill() {
    const { overflowY } = getComputedStyle(document.documentElement);
    return overflowY === 'hidden' || overflowY === 'clip';
  }

  function measure() {
    dirty = false;
    const list = toValue(items);
    const scrollY = window.scrollY;
    const found: (MeasuredEntry & { element: Element })[] = [];
    if (root.value)
      for (const [item, heading] of list.entries()) {
        const element = root.value.querySelector(`#${CSS.escape(heading.id)}`);
        // A heading that is not drawn — hidden with what holds it — is never
        // the current one.
        if (!element?.getClientRects().length) continue;
        const rect = element.getBoundingClientRect();
        found.push({
          item,
          top: rect.top + scrollY,
          height: rect.height,
          element,
        });
      }
    found.sort((a, b) => a.top - b.top || a.item - b.item);
    entries = found.map(({ item, top, height }) => ({ item, top, height }));
    // `innerHeight` rather than the root's `clientHeight`: on a phone the
    // window grows as its toolbar hides, and the page then scrolls no
    // further than the window it fills. A resize brings it here again.
    const viewport = window.innerHeight;
    maxScroll = Math.max(
      0,
      (document.scrollingElement ?? document.documentElement).scrollHeight -
        viewport,
    );
    activations = headingActivations({
      headings: entries,
      // Every heading lands below the same sticky bars
      // (`--public-anchor-offset`), resolved here to pixels.
      offset: found[0]
        ? parseFloat(getComputedStyle(found[0].element).scrollMarginTop) || 0
        : 0,
      maxScroll,
      viewport,
    });
  }

  function update() {
    frame = 0;
    if (pageHeldStill()) {
      dirty = true;
      return;
    }
    if (dirty) measure();
    const list = toValue(items);
    let item: number;
    const pinnedItem = pinned
      ? list.findIndex((heading) => heading.id === pinned)
      : -1;
    if (pinnedItem >= 0 && entries.some((entry) => entry.item === pinnedItem))
      item = pinnedItem;
    else {
      // A bounce past either end of the page on a phone scrolls beyond it.
      const scrollY = Math.min(Math.max(window.scrollY, 0), maxScroll);
      item = entries[activeHeadingIndex(activations, scrollY)]?.item ?? -1;
    }
    active.value = list[item]?.id;
  }

  function pin(id: string) {
    if (!toValue(items).some((heading) => heading.id === id)) return;
    pinned = id;
    schedule();
  }

  function release() {
    if (!pinned) return;
    pinned = undefined;
    schedule();
  }

  function hashId(hash: string) {
    if (hash.length < 2) return undefined;
    try {
      return decodeURIComponent(hash.slice(1));
    } catch {
      return hash.slice(1);
    }
  }

  // Captured on the window, ahead of the phone's sheet, which stops a link's
  // click on its way down to scroll to the place itself.
  function followedLink(event: MouseEvent) {
    if (
      event.button !== 0 ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element | null)?.closest?.('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const { origin, pathname, search } = window.location;
    if (
      link.origin !== origin ||
      link.pathname !== pathname ||
      link.search !== search
    )
      return;
    const id = hashId(link.hash);
    if (id) pin(id);
  }

  const options = { passive: true } as const;

  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener('scroll', schedule, options);
    window.addEventListener('resize', invalidate, options);
    window.addEventListener('click', followedLink, { capture: true });
    // Pointing, a wheel or a key are the reader's own: the page goes where
    // they take it, and so does the entry. A click on an entry comes after
    // its press, so it pins again.
    window.addEventListener('pointerdown', release, options);
    window.addEventListener('wheel', release, options);
    window.addEventListener('keydown', release, options);
    resizeObserver = new ResizeObserver(invalidate);
    resizeObserver.observe(document.documentElement);
    if (root.value) resizeObserver.observe(root.value);
    const id = hashId(window.location.hash);
    if (id) pin(id);
    invalidate();
  }

  function stop() {
    if (!listening) return;
    listening = false;
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', invalidate);
    window.removeEventListener('click', followedLink, { capture: true });
    window.removeEventListener('pointerdown', release);
    window.removeEventListener('wheel', release);
    window.removeEventListener('keydown', release);
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pinned = undefined;
    entries = [];
    activations = [];
    active.value = undefined;
  }

  onMounted(() => {
    // Another page in the same layout — the next day of a diary — or headings
    // that came or went: measured anew, and a pin of one that went dropped.
    // A table of contents that empties stops listening altogether.
    watch(
      [() => toValue(items).map((heading) => heading.id), root],
      ([ids, element], previous) => {
        if (!ids.length) return stop();
        if (!listening) return listen();
        const previousRoot = previous?.[1];
        if (previousRoot && previousRoot !== element)
          resizeObserver?.unobserve(previousRoot);
        if (element) resizeObserver?.observe(element);
        if (pinned && !ids.includes(pinned)) pinned = undefined;
        invalidate();
      },
      { immediate: true, flush: 'post' },
    );
    watch(
      [() => stickyHeader?.height.value, isAdmin],
      () => listening && invalidate(),
    );
  });
  onScopeDispose(stop);

  return active;
}
