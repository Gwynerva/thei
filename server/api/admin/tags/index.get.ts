import { asc, inArray, sql } from 'drizzle-orm';
import { buildTagItems, isTagUuid } from '../../../thei/tags';
import { rankTagSearch, type TagItem, type TagListItem } from '#layers/thei/shared/tag';

export default defineEventHandler(async (event): Promise<TagListItem[] | TagItem[]> => {
  const query = getQuery(event);
  if (typeof query.query === 'string') {
    if (query.query.length > 100)
      throw createError({ statusCode: 400, message: 'Search query is too long' });
    const excludeItems = (
      typeof query.exclude === 'string' ? query.exclude.split(',') : []
    ).filter(Boolean);
    if (excludeItems.length > 100 || excludeItems.some((item) => !isTagUuid(item)))
      throw createError({ statusCode: 400, message: 'Invalid excluded tags' });
    const excluded = new Set(excludeItems);
    const { db, schema } = THEI_SERVER.useDb();
    const tags = db.select().from(schema.tags).all().filter((tag) => !excluded.has(tag.tagUuid));
    return buildTagItems(rankTagSearch(tags, query.query));
  }
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db.select().from(schema.tags).orderBy(asc(schema.tags.title)).all();
  const counts = rows.length
    ? db
        .select({
          tagUuid: schema.tagUsages.tagUuid,
          containerType: schema.tagUsages.containerType,
          count: sql<number>`count(*)`,
        })
        .from(schema.tagUsages)
        .where(inArray(schema.tagUsages.tagUuid, rows.map((tag) => tag.tagUuid)))
        .groupBy(schema.tagUsages.tagUuid, schema.tagUsages.containerType)
        .all()
    : [];
  const items = await buildTagItems(rows);
  return items.map((tag) => {
      const tagCounts = counts.filter((row) => row.tagUuid === tag.tagUuid);
      const usageCounts = Object.fromEntries(
        tagCounts.map((row) => [row.containerType, Number(row.count)]),
      );
      return {
        ...tag,
        usageCounts,
      };
    });
});
