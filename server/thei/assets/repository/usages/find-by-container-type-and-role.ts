import { and, eq } from 'drizzle-orm';
import type { AssetContainerType, AssetRole } from '#layers/thei/shared/asset';

export async function findAssetsByContainerTypeAndRole(
  containerType: AssetContainerType,
  role: AssetRole,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({
      asset: schema.assets,
      containerId: schema.assetUsages.containerId,
    })
    .from(schema.assets)
    .innerJoin(
      schema.assetUsages,
      eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
    )
    .where(
      and(
        eq(schema.assetUsages.containerType, containerType),
        eq(schema.assetUsages.role, role),
      ),
    );
}
