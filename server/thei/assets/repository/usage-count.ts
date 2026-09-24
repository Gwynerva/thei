import { inArray } from 'drizzle-orm';
import type { AssetUsageMeta } from '#layers/thei/shared/asset';

export async function countAssetPlacements(assetUuid: string): Promise<number> {
  return (await countAssetPlacementsByUuids([assetUuid])).get(assetUuid) ?? 0;
}

/**
 * Places each asset is shown in, for several assets in one query.
 *
 * A preview link is the engine's own bookkeeping, not a placement; a content
 * usage row stands for every block that shows the file.
 */
export async function countAssetPlacementsByUuids(
  assetUuids: string[],
): Promise<Map<string, number>> {
  const counts = new Map(assetUuids.map((uuid) => [uuid, 0]));
  if (!assetUuids.length) return counts;

  const { db, schema } = THEI_SERVER.useDb();
  const usages = await db
    .select({
      assetUuid: schema.assetUsages.assetUuid,
      role: schema.assetUsages.role,
      meta: schema.assetUsages.meta,
    })
    .from(schema.assetUsages)
    .where(inArray(schema.assetUsages.assetUuid, assetUuids));

  for (const usage of usages) {
    if (usage.role === 'preview') continue;
    const meta = usage.meta as AssetUsageMeta | null;
    const placements =
      usage.role !== 'content'
        ? 1
        : meta && 'refs' in meta
          ? meta.refs.length
          : 0;
    counts.set(
      usage.assetUuid,
      (counts.get(usage.assetUuid) ?? 0) + placements,
    );
  }
  return counts;
}
