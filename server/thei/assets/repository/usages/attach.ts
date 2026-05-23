import type { AssetContainerType, AssetRole } from '#layers/thei/shared/asset';

export function attachAssetUsage(
  assetUuid: string,
  containerType: AssetContainerType,
  containerId: string,
  role: AssetRole,
) {
  const { db, schema } = THEI_SERVER.useDb();
  db.insert(schema.assetUsages)
    .values({ assetUuid, containerType, containerId, role })
    .onConflictDoNothing()
    .run();
}
