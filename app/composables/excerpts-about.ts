import type { MaybeRefOrGetter } from 'vue';
import type {
  AdminExcerptAbout,
  AdminExcerptsAboutResponse,
} from '#layers/thei/shared/api/excerpt';
import {
  relationEndpointKey,
  type RelationEndpoint,
} from '#layers/thei/shared/relation';

/**
 * The excerpts about an entity, as its form asks for them once it is open:
 * for the read-only tab of its relations block, the recommendation to
 * relate their parents, and the question its deletion asks. Nothing is
 * asked for an entity that does not exist yet; a failed request lists none.
 */
export function useExcerptsAbout(
  target: MaybeRefOrGetter<RelationEndpoint | undefined>,
) {
  const items = shallowRef<AdminExcerptAbout[]>([]);
  const onlyTarget = ref(0);
  const loading = ref(false);
  let request = 0;

  async function load() {
    const value = toValue(target);
    const mine = ++request;
    if (!value) {
      items.value = [];
      onlyTarget.value = 0;
      return;
    }
    loading.value = true;
    try {
      const response = await $fetch<AdminExcerptsAboutResponse>(
        '/api/admin/excerpts/about',
        { query: { type: value.type, id: value.id } },
      );
      if (mine !== request) return;
      items.value = response.items;
      onlyTarget.value = response.onlyTarget;
    } catch {
      if (mine !== request) return;
      items.value = [];
      onlyTarget.value = 0;
    } finally {
      if (mine === request) loading.value = false;
    }
  }

  onMounted(() => {
    watch(
      () => {
        const value = toValue(target);
        return value ? relationEndpointKey(value) : '';
      },
      () => void load(),
      { immediate: true },
    );
  });

  return { items, onlyTarget, loading, refresh: load };
}
