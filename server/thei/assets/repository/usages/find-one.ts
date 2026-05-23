import { and, eq } from 'drizzle-orm';
import type { AssetContainerType, AssetRole } from '#layers/thei/shared/asset';

export function findAssetUsage(
  assetUuid: string,
  containerType: AssetContainerType,
  containerId: string,
  role: AssetRole,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.assetUsages)
    .where(
      and(
        eq(schema.assetUsages.assetUuid, assetUuid),
        eq(schema.assetUsages.containerType, containerType),
        eq(schema.assetUsages.containerId, containerId),
        eq(schema.assetUsages.role, role),
      ),
    )
    .get();
}
