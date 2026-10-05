import { debounce } from 'perfect-debounce';
import {
  CONTENT_ENTITY_SEARCH_MAX_LIMIT,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import {
  isRelationEntityType,
  RELATION_ENTITY_TYPES,
  type RelationEntityType,
} from '#layers/thei/shared/relation';

export type RelationRecommendation = ContentEntitySearchItem & {
  entityType: RelationEntityType;
};

/**
 * The entities a relations block recommends, described for their chips:
 * `keys` names them as `type:uuid`, in the order the text links to them.
 *
 * Each is described once and remembered, so typing in the text does not ask
 * again for what is already known; a link added to the text asks only for
 * what it names. The form is drawn on the server, and the recommendations
 * come after it, in the browser. A failed request recommends nothing.
 */
export function useRelationRecommendations(keys: MaybeRefOrGetter<string[]>) {
  const known = shallowReactive(
    new Map<string, RelationRecommendation | null>(),
  );
  /** Keys asked for or about to be, so none is asked for twice. */
  const asked = new Set<string>();
  const pending = new Set<string>();
  /** The form is gone: a request still waiting for its turn is not made. */
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
    pending.clear();
  });

  async function describe(missing: string[]) {
    try {
      const items = await $fetch<ContentEntitySearchItem[]>(
        '/api/admin/content-entities',
        {
          query: {
            keys: missing.join(','),
            entityTypes: RELATION_ENTITY_TYPES.join(','),
          },
        },
      );
      const found = new Map(
        items
          .filter((item): item is RelationRecommendation =>
            isRelationEntityType(item.entityType),
          )
          .map((item) => [`${item.entityType}:${item.entityId}`, item]),
      );
      for (const key of missing) known.set(key, found.get(key) ?? null);
    } catch {
      // Asked again the next time the text names them.
      for (const key of missing) asked.delete(key);
    }
  }

  const flush = debounce(async () => {
    if (disposed) return;
    const missing = [...pending];
    pending.clear();
    for (
      let start = 0;
      start < missing.length;
      start += CONTENT_ENTITY_SEARCH_MAX_LIMIT
    ) {
      if (disposed) return;
      await describe(
        missing.slice(start, start + CONTENT_ENTITY_SEARCH_MAX_LIMIT),
      );
    }
  }, 300);

  onMounted(() => {
    watch(
      () => toValue(keys).join(','),
      () => {
        const missing = toValue(keys).filter((key) => !asked.has(key));
        if (!missing.length) return;
        for (const key of missing) {
          asked.add(key);
          pending.add(key);
        }
        void flush();
      },
      { immediate: true },
    );
  });

  return computed(() =>
    toValue(keys).flatMap((key) => {
      const item = known.get(key);
      return item ? [item] : [];
    }),
  );
}
