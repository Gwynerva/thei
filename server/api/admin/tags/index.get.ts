import { asc, inArray, sql } from 'drizzle-orm';
import { buildTagItems } from '../../../thei/tags';
import type { TagListItem } from '#layers/thei/shared/tag';

export default defineEventHandler(async (): Promise<TagListItem[]> => {
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
