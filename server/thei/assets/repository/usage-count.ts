import { eq } from 'drizzle-orm';
import type { AssetUsageMeta } from '#layers/thei/shared/asset';

export async function countAssetPlacements(assetUuid: string): Promise<number> {
  const { db, schema } = THEI_SERVER.useDb();
  const usages = await db
    .select({
      role: schema.assetUsages.role,
      meta: schema.assetUsages.meta,
    })
    .from(schema.assetUsages)
    .where(eq(schema.assetUsages.assetUuid, assetUuid));

  return usages.reduce((total, usage) => {
    if (usage.role === 'preview') return total;
    if (usage.role !== 'content') return total + 1;

    const meta = usage.meta as AssetUsageMeta | null;
    return total + (meta && 'refs' in meta ? meta.refs.length : 0);
  }, 0);
}
