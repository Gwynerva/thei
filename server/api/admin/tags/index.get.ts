import { asc, inArray, sql } from 'drizzle-orm';
import { buildTagItems, isTagUuid } from '../../../thei/tags';
import {
  matchedTagSynonym,
  rankTagSearch,
  tagNamedBy,
  type TagListItem,
  type TagSearchItem,
} from '#layers/thei/shared/tag';

export default defineEventHandler(
  async (event): Promise<TagListItem[] | TagSearchItem[]> => {
    const query = getQuery(event);
    if (typeof query.query === 'string') {
      if (query.query.length > 100)
        throw createError({
          statusCode: 400,
          message: 'Search query is too long',
        });
      const excludeItems = (
        typeof query.exclude === 'string' ? query.exclude.split(',') : []
      ).filter(Boolean);
      if (
        excludeItems.length > 100 ||
        excludeItems.some((item) => !isTagUuid(item))
      )
        throw createError({
          statusCode: 400,
          message: 'Invalid excluded tags',
        });
      const excluded = new Set(excludeItems);
      const search = query.query;
      const { db, schema } = THEI_SERVER.useDb();
      const all = db.select().from(schema.tags).all();
      const ranked = rankTagSearch(
        all.filter((tag) => !excluded.has(tag.tagUuid)),
        search,
      );
      // A tag already on the entity comes back only when the query is one of
      // its synonyms: the picker would otherwise offer to create it again.
      const named = all.filter(
        (tag) =>
          excluded.has(tag.tagUuid) &&
          tagNamedBy({ title: '', synonyms: tag.synonyms }, search),
      );
      const rows = [...named, ...ranked];
      const items = await buildTagItems(rows);
      return items.map((item, position) => {
        const row = rows[position]!;
        const matchedSynonym = matchedTagSynonym(row, search);
        return {
          ...item,
          ...(matchedSynonym ? { matchedSynonym } : {}),
          ...(tagNamedBy(row, search) ? { exact: true } : {}),
          ...(position < named.length ? { selected: true } : {}),
        };
      });
    }
    const { db, schema } = THEI_SERVER.useDb();
    const rows = db
      .select()
      .from(schema.tags)
      .orderBy(asc(schema.tags.title))
      .all();
    const counts = rows.length
      ? db
          .select({
            tagUuid: schema.tagUsages.tagUuid,
            containerType: schema.tagUsages.containerType,
            count: sql<number>`count(*)`,
          })
          .from(schema.tagUsages)
          .where(
            inArray(
              schema.tagUsages.tagUuid,
              rows.map((tag) => tag.tagUuid),
            ),
          )
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
  },
);
