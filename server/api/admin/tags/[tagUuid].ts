import { and, eq, sql } from 'drizzle-orm';
import {
  buildTagItem,
  findTagConflict,
  isTagUuid,
  tagConflictMessage,
} from '../../../thei/tags';
import { normalizeTagTitle, validateTagData, type TagEditData, type TagSaveResponse, type TagUsageStats } from '#layers/thei/shared/tag';

export default defineEventHandler(async (event) => {
  const tagUuid = getRouterParam(event, 'tagUuid')!;
  if (!isTagUuid(tagUuid))
    throw createError({ statusCode: 400, message: 'Invalid tag ID' });
  const { db, schema } = THEI_SERVER.useDb();
  const tag = await db.query.tags.findFirst({ where: eq(schema.tags.tagUuid, tagUuid) });
  if (!tag) throw createError({ statusCode: 404, message: 'Tag not found' });
  if (event.method === 'GET') {
    const counts = db.select({
      containerType: schema.tagUsages.containerType,
      count: sql<number>`count(*)`,
    }).from(schema.tagUsages).where(eq(schema.tagUsages.tagUuid, tagUuid))
      .groupBy(schema.tagUsages.containerType).all();
    const stats: TagUsageStats = {
      total: counts.reduce((sum, row) => sum + Number(row.count), 0),
      projects: Number(counts.find((row) => row.containerType === 'project')?.count ?? 0),
      events: Number(counts.find((row) => row.containerType === 'event')?.count ?? 0),
    };
    return { ...(await buildTagItem(tag)), usageStats: stats };
  }
  if (event.method === 'PUT') {
    const result = validateTagData(await readBody<TagEditData>(event));
    if (typeof result === 'string') return { type: 'error', message: result } satisfies TagSaveResponse;
    const conflict = findTagConflict({
      normalizedTitle: normalizeTagTitle(result.title),
      slug: result.slug,
      publicId: result.publicId,
    }, tagUuid);
    if (conflict)
      return { type: 'error', code: conflict, message: tagConflictMessage(conflict) } satisfies TagSaveResponse;
    if (
      result.iconAssetUuid &&
      !(await db.query.assets.findFirst({
        where: eq(schema.assets.assetUuid, result.iconAssetUuid),
      }))
    )
      return { type: 'error', message: THEI_SERVER.phrase.tag_icon_not_found };
    try {
      db.transaction((tx) => {
        tx.update(schema.tags).set({
          title: result.title,
          normalizedTitle: normalizeTagTitle(result.title),
          slug: result.slug,
          publicId: result.publicId,
          description: result.description,
          accentColor: result.accentColor ?? null,
        }).where(eq(schema.tags.tagUuid, tagUuid)).run();
        const current = tx.select().from(schema.assetUsages).where(and(
          eq(schema.assetUsages.containerType, 'tag'),
          eq(schema.assetUsages.containerId, tagUuid),
          eq(schema.assetUsages.role, 'icon'),
        )).get();
        if (current?.assetUuid !== result.iconAssetUuid) {
          tx.delete(schema.assetUsages).where(and(
            eq(schema.assetUsages.containerType, 'tag'),
            eq(schema.assetUsages.containerId, tagUuid),
            eq(schema.assetUsages.role, 'icon'),
          )).run();
          if (result.iconAssetUuid) tx.insert(schema.assetUsages).values({
            assetUuid: result.iconAssetUuid, containerType: 'tag', containerId: tagUuid, role: 'icon',
          }).run();
        }
      });
    } catch (error) {
      const raceConflict = findTagConflict({
        normalizedTitle: normalizeTagTitle(result.title),
        slug: result.slug,
        publicId: result.publicId,
      }, tagUuid);
      if (raceConflict)
        return {
          type: 'error',
          code: raceConflict,
          message: tagConflictMessage(raceConflict),
        } satisfies TagSaveResponse;
      throw error;
    }
    return { type: 'success', tagUuid } satisfies TagSaveResponse;
  }
  if (event.method === 'DELETE') {
    db.transaction((tx) => {
      tx.delete(schema.tagUsages).where(eq(schema.tagUsages.tagUuid, tagUuid)).run();
      tx.delete(schema.assetUsages).where(and(
        eq(schema.assetUsages.containerType, 'tag'),
        eq(schema.assetUsages.containerId, tagUuid),
      )).run();
      tx.delete(schema.tags).where(eq(schema.tags.tagUuid, tagUuid)).run();
    });
    return;
  }
  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
