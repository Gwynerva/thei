import { and, eq, inArray } from 'drizzle-orm';
import { rankTagRecommendations, type TagItem } from '#layers/thei/shared/tag';
import { buildTagItems, isTagUuid } from '../../thei/tags';

type RecommendationBody = {
  text?: string;
  selectedTagUuids?: string[];
  projectUuid?: string;
};

export default defineEventHandler(async (event): Promise<TagItem[]> => {
  const body = await readBody<RecommendationBody>(event);
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw createError({ statusCode: 400, message: 'Invalid request body' });
  if (typeof body.text !== 'undefined' && typeof body.text !== 'string')
    throw createError({ statusCode: 400, message: 'Invalid recommendation text' });
  if ((body.text?.length ?? 0) > 20_000)
    throw createError({ statusCode: 400, message: 'Recommendation text is too long' });
  const selectedItems = body.selectedTagUuids ?? [];
  if (
    !Array.isArray(selectedItems) ||
    selectedItems.length > 100 ||
    selectedItems.some((item) => typeof item !== 'string' || !isTagUuid(item))
  )
    throw createError({ statusCode: 400, message: 'Invalid selected tags' });
  if (
    body.projectUuid !== undefined &&
    (typeof body.projectUuid !== 'string' || !body.projectUuid.startsWith('p-'))
  )
    throw createError({ statusCode: 400, message: 'Invalid project ID' });
  const selected = new Set(selectedItems);
  const { db, schema } = THEI_SERVER.useDb();
  const tags = db.select().from(schema.tags).all().filter((tag) => !selected.has(tag.tagUuid));

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
            container.containerId !== body.projectUuid,
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

  const ranked = rankTagRecommendations(tags, body.text ?? '', coUsage);
  return buildTagItems(ranked);
});
