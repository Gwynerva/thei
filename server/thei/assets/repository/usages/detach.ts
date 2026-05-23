import { and, eq } from 'drizzle-orm';
import type { AssetContainerType, AssetRole } from '#layers/thei/shared/asset';

export function detachAssetUsage(
  assetUuid: string,
  containerType: AssetContainerType,
  containerId: string,
  role: AssetRole,
) {
  const { db, schema } = THEI_SERVER.useDb();
  db.delete(schema.assetUsages)
    .where(
      and(
        eq(schema.assetUsages.assetUuid, assetUuid),
        eq(schema.assetUsages.containerType, containerType),
        eq(schema.assetUsages.containerId, containerId),
        eq(schema.assetUsages.role, role),
      ),
    )
    .run();
}
