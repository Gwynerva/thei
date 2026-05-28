import { and, eq, inArray, isNull, lt, not, sql } from 'drizzle-orm';

export async function findOrphanedAssets(cutoffMs: number) {
  const { db, schema } = THEI_SERVER.useDb();

  // Preview thumbnails of videos that are currently in use (have asset_usages).
  // These previews have no asset_usages row of their own — the link lives only in
  // the parent video's meta JSON — so we must exclude them explicitly.
  const usedPreviewRows = await db
    .selectDistinct({
      previewUuid: sql<string>`json_extract(${schema.assets.meta}, '$.previewAssetUuid')`,
    })
    .from(schema.assets)
    .innerJoin(
      schema.assetUsages,
      eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
    )
    .where(
      sql`json_extract(${schema.assets.meta}, '$.previewAssetUuid') IS NOT NULL`,
    );

  const usedPreviewUuids = usedPreviewRows.map((r) => r.previewUuid);

  return db
    .select({
      assetUuid: schema.assets.assetUuid,
      extension: schema.assets.extension,
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
        usedPreviewUuids.length > 0
          ? not(inArray(schema.assets.assetUuid, usedPreviewUuids))
          : undefined,
      ),
    );
}
