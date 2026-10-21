import { debounce } from 'perfect-debounce';
import type { WatchSource } from 'vue';
import {
  CONTENT_ENTITY_TYPES,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import {
  CONTENT_ENTITY_SEARCH_LIMIT,
  CONTENT_ENTITY_SUGGEST_TEXT_LIMIT,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';

/**
 * A search of the site's own entities as a picker asks it: what is typed,
 * a moment after it is typed, and before anything is, what `suggest` — the
 * words a link is being made over — names, then the most recent. Each answer
 * replaces the last one only if nothing was typed since.
 */
export function useContentEntitySearch(options: {
  entityTypes?: () => readonly ContentEntityType[];
  exclude?: () => readonly string[];
  publicOnly?: () => boolean;
  limit?: () => number;
  suggest?: () => string | undefined;
  /** While it holds, nothing is asked: what is typed is no search. */
  paused?: () => boolean;
}) {
  const query = ref('');
  const results = ref<ContentEntitySearchItem[]>([]);
  const loading = ref(false);
  const error = ref(false);
  let version = 0;

  const search = debounce(async (current: number) => {
    if (current !== version) return;
    const text = query.value.trim();
    const suggest = text
      ? undefined
      : Array.from(options.suggest?.()?.trim() ?? '')
          .slice(0, CONTENT_ENTITY_SUGGEST_TEXT_LIMIT)
          .join('') || undefined;
    try {
      const response = await $fetch<ContentEntitySearchItem[]>(
        '/api/admin/content-entities',
        {
          query: {
            query: text,
            suggest,
            entityTypes: (options.entityTypes?.() ?? CONTENT_ENTITY_TYPES).join(
              ',',
            ),
            exclude: (options.exclude?.() ?? []).join(','),
            publicOnly: options.publicOnly?.() ? 'true' : undefined,
            limit: options.limit?.() ?? CONTENT_ENTITY_SEARCH_LIMIT,
          },
        },
      );
      if (current !== version) return;
      results.value = response;
    } catch {
      if (current === version) {
        results.value = [];
        error.value = true;
      }
    } finally {
      if (current === version) loading.value = false;
    }
  }, 180);

  /** Asks again for what the field says now. */
  function refresh() {
    if (options.paused?.()) {
      stop();
      return;
    }
    const current = ++version;
    loading.value = true;
    error.value = false;
    void search(current);
  }

  /** Stops waiting for any answer: one that comes is thrown away. */
  function stop() {
    version++;
    loading.value = false;
  }

  watch(query, refresh);
  onScopeDispose(stop);

  return { query, results, loading, error, refresh, stop };
}

/**
 * The row Enter takes in a picker's list, ringed as the select's option is:
 * the first, or the one `start` names, and again after every new answer.
 * `start` may name none (-1): rows offered with nothing typed wait for the
 * keys or the pointer to choose one. The arrows walk it; the mouse takes the
 * row it is over, a finger only what it taps.
 */
export function useActiveRow(
  count: () => number,
  reset: WatchSource,
  start: () => number = () => 0,
) {
  const listId = useId();
  const index = ref(start());
  watch(reset, () => (index.value = start()));

  /**
   * A row of the list while it has any, unless none is chosen yet; -1 while
   * it is empty or nothing is chosen.
   */
  const activeIndex = computed(() => {
    const total = count();
    if (!total || index.value < 0) return -1;
    return Math.min(index.value, total - 1);
  });

  const optionId = (index: number) => `${listId}-${index}`;

  function move(step: number) {
    const total = count();
    if (!total) return;
    // From none, down goes to the first row and up to the last.
    const from =
      activeIndex.value < 0 ? (step > 0 ? -1 : 0) : activeIndex.value;
    index.value = (((from + step) % total) + total) % total;
    document
      .getElementById(optionId(index.value))
      ?.scrollIntoView({ block: 'nearest' });
  }

  function pointAt(event: PointerEvent, row: number) {
    if (event.pointerType === 'mouse') index.value = row;
  }

  return {
    listId,
    activeIndex,
    optionId,
    move,
    pointAt,
    /** The row Enter takes. */
    current: () => activeIndex.value,
  };
}

/** The key a picker tells entities apart by. */
export function contentEntityKey(item: {
  entityType: string;
  entityId: string;
}) {
  return `${item.entityType}:${item.entityId}`;
}
