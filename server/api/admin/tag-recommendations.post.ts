import { and, eq, inArray } from 'drizzle-orm';
import { isRelationEntityType } from '#layers/thei/shared/relation';
import {
  rankTagRecommendations,
  TAG_CONTAINER_TYPES,
  type TagItem,
} from '#layers/thei/shared/tag';
import {
  clampTagContextText,
  type TagRecommendationRequest,
} from '#layers/thei/shared/tag-recommendation';
import { isOneOf } from '#layers/thei/shared/utils/isOneOf';
import { buildTagItems, isTagUuid } from '../../thei/tags';
import { markReadOnlyRequest } from '../../thei/read-only-request';

export default defineEventHandler(async (event): Promise<TagItem[]> => {
  markReadOnlyRequest(event);
  const request = parseRequest(await readBody<unknown>(event));
  const selected = new Set(request.selectedTagUuids);
  const { db, schema } = THEI_SERVER.useDb();
  const tags = db
    .select()
    .from(schema.tags)
    .all()
    .filter((tag) => !selected.has(tag.tagUuid));

  const coUsage = new Map<string, number>();
  if (selected.size) {
    const containers = db
      .select({
        containerType: schema.tagUsages.containerType,
        containerId: schema.tagUsages.containerId,
      })
      .from(schema.tagUsages)
      .where(inArray(schema.tagUsages.tagUuid, [...selected]))
      .groupBy(schema.tagUsages.containerType, schema.tagUsages.containerId)
      .all();
    const relatedContainerIds = new Set(
      containers
        .filter(
          (container) =>
            container.containerType === 'project' &&
            container.containerId !== request.owner?.id,
        )
        .map((container) => container.containerId),
    );
    const related = relatedContainerIds.size
      ? db
          .select({
            tagUuid: schema.tagUsages.tagUuid,
            containerId: schema.tagUsages.containerId,
          })
          .from(schema.tagUsages)
          .where(
            and(
              eq(schema.tagUsages.containerType, 'project'),
              inArray(schema.tagUsages.containerId, [...relatedContainerIds]),
            ),
          )
          .all()
      : [];
    for (const item of related) {
      if (!selected.has(item.tagUuid))
        coUsage.set(item.tagUuid, (coUsage.get(item.tagUuid) ?? 0) + 1);
    }
  }

  const ranked = rankTagRecommendations(
    tags,
    `${request.title}\n${request.text}`,
    coUsage,
  );
  return buildTagItems(ranked);
});

function fail(message: string): never {
  throw createError({ statusCode: 400, message });
}

function parseRequest(body: unknown): TagRecommendationRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    fail('Invalid request body');
  const item = body as Partial<Record<keyof TagRecommendationRequest, unknown>>;
  const title = item.title ?? '';
  const text = item.text ?? '';
  if (typeof title !== 'string' || typeof text !== 'string')
    fail('Invalid recommendation text');
  const selectedTagUuids = item.selectedTagUuids ?? [];
  if (
    !Array.isArray(selectedTagUuids) ||
    selectedTagUuids.length > 100 ||
    selectedTagUuids.some(
      (uuid) => typeof uuid !== 'string' || !isTagUuid(uuid),
    )
  )
    fail('Invalid selected tags');
  const related = item.related ?? [];
  if (
    !Array.isArray(related) ||
    related.length > 1_000 ||
    related.some(
      (endpoint) =>
        !endpoint ||
        typeof endpoint !== 'object' ||
        !isRelationEntityType(endpoint.type) ||
        typeof endpoint.id !== 'string',
    )
  )
    fail('Invalid related entities');
  const owner = item.owner as TagRecommendationRequest['owner'] | undefined;
  if (
    owner !== undefined &&
    (!owner ||
      typeof owner !== 'object' ||
      !isOneOf(owner.type, TAG_CONTAINER_TYPES) ||
      typeof owner.id !== 'string')
  )
    fail('Invalid owner');
  return {
    owner,
    title: title.slice(0, 1_000),
    text: clampTagContextText(text),
    selectedTagUuids: selectedTagUuids as string[],
    related: related as TagRecommendationRequest['related'],
  };
}
