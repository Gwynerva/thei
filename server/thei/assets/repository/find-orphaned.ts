import { and, eq, isNull, lt } from 'drizzle-orm';

export async function findOrphanedAssets(cutoffMs: number) {
  const { db, schema } = THEI_SERVER.useDb();

  return db
    .select({
      assetUuid: schema.assets.assetUuid,
      extension: schema.assets.extension,
      type: schema.assets.type,
      meta: schema.assets.meta,
    })
    .from(schema.assets)
    .leftJoin(
      schema.assetUsages,
      eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
    )
    .where(
      and(
        isNull(schema.assetUsages.assetUuid),
        lt(schema.assets.touchedAt, cutoffMs),
      ),
    );
}
