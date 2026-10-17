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
 * The row the arrow keys are on in a picker's list: none until they are
 * used, and Enter then takes the first. A new answer starts it over; the
 * mouse takes the row it is over, a finger only what it taps.
 */
export function useActiveRow(count: () => number, reset: WatchSource) {
  const listId = useId();
  const activeIndex = ref(-1);
  watch(reset, () => (activeIndex.value = -1));

  const optionId = (index: number) => `${listId}-${index}`;

  function move(step: number) {
    const total = count();
    if (!total) return;
    activeIndex.value = (activeIndex.value + step + total) % total;
    document
      .getElementById(optionId(activeIndex.value))
      ?.scrollIntoView({ block: 'nearest' });
  }

  function pointAt(event: PointerEvent, index: number) {
    if (event.pointerType === 'mouse') activeIndex.value = index;
  }

  return {
    listId,
    activeIndex,
    optionId,
    move,
    pointAt,
    /** The row Enter takes. */
    current: () => Math.max(0, activeIndex.value),
  };
}

/** The key a picker tells entities apart by. */
export function contentEntityKey(item: {
  entityType: string;
  entityId: string;
}) {
  return `${item.entityType}:${item.entityId}`;
}
