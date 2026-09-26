import { debounce } from 'perfect-debounce';
import type { RelationEditItem } from '#layers/thei/shared/relation';
import { isOneOf } from '#layers/thei/shared/utils/isOneOf';
import { TAG_CONTAINER_TYPES, type TagEditItem } from '#layers/thei/shared/tag';
import {
  clampTagContextText,
  TAG_RECOMMENDATION,
  type TagContext,
  type TagRecommendation,
  type TagRecommendationRequest,
} from '#layers/thei/shared/tag-recommendation';

/**
 * Tag recommendations for the project or event being edited.
 *
 * They only matter to the person looking at the form, so they are loaded in
 * the browser once it is mounted, never during server rendering. A request is
 * made again only when something it depends on changed: reordering tags or
 * relations asks for nothing new, and typing waits for a pause. The previous
 * list stays in place while the next one loads, so it does not flicker.
 */
export function useTagRecommendations(options: {
  owner: MaybeRefOrGetter<TagRecommendationRequest['owner']>;
  context: MaybeRefOrGetter<TagContext>;
  tags: MaybeRefOrGetter<TagEditItem[] | undefined>;
  relations: MaybeRefOrGetter<RelationEditItem[] | undefined>;
}) {
  const recommendations = ref<TagRecommendation[]>([]);
  const failed = ref(false);
  let version = 0;

  const request = computed<TagRecommendationRequest>(() => {
    const context = toValue(options.context);
    return {
      owner: toValue(options.owner),
      title: context.title,
      text: clampTagContextText(context.text),
      selectedTagUuids: (toValue(options.tags) ?? [])
        .flatMap((tag) => (tag.tagUuid ? [tag.tagUuid] : []))
        .sort(),
      // Only projects and events carry tags to learn from.
      related: (toValue(options.relations) ?? [])
        .filter((relation) => isOneOf(relation.entityType, TAG_CONTAINER_TYPES))
        .map((relation) => ({
          type: relation.entityType,
          id: relation.entityId,
        }))
        .sort((left, right) =>
          `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`),
        ),
    };
  });
  const requestKey = computed(() => JSON.stringify(request.value));

  async function load() {
    const current = ++version;
    try {
      const result = await $fetch<TagRecommendation[]>(
        '/api/admin/tag-recommendations',
        {
          method: 'POST',
          body: request.value,
        },
      );
      if (current !== version) return;
      recommendations.value = result;
      failed.value = false;
    } catch {
      if (current === version) failed.value = true;
    }
  }
  const loadSoon = debounce(load, 600);

  onMounted(() => {
    void load();
    watch(requestKey, () => void loadSoon());
  });

  /** Tags worth a reminder: the entity has none, and these clearly fit. */
  const reminderCount = computed(() =>
    (toValue(options.tags) ?? []).length
      ? 0
      : recommendations.value.filter(
          ({ score }) => score >= TAG_RECOMMENDATION.strongScore,
        ).length,
  );

  return { recommendations, failed, reminderCount };
}
