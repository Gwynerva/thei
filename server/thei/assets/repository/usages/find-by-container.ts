import { and, eq } from 'drizzle-orm';
import type { AssetContainerType } from '#layers/thei/shared/asset';

export async function findAssetsByContainer(
  containerType: AssetContainerType,
  containerId: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ asset: schema.assets, role: schema.assetUsages.role })
    .from(schema.assets)
    .innerJoin(
      schema.assetUsages,
      eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
    )
    .where(
      and(
        eq(schema.assetUsages.containerType, containerType),
        eq(schema.assetUsages.containerId, containerId),
      ),
    );
}
