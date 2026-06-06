import { rm } from 'node:fs/promises';
import { AssetType } from '#layers/thei/shared/asset';
import { findOrphanedAssets } from './repository/find-orphaned';
import { deleteAsset } from './repository/delete';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function deleteOrphanedAsset(assetUuid: string, extension: string) {
  const filePath = THEI_SERVER.assets.filePath(assetUuid, extension);
  await rm(filePath, { force: true }).catch(() => {});
  try {
    await deleteAsset(assetUuid);
  } catch {
    THEI_SERVER.console
      .tag('Assets')
      .error(`Failed to delete DB record for orphaned asset ${assetUuid}`);
    return;
  }
  THEI_SERVER.console
    .tag('Assets')
    .log(`Cleaned up orphaned asset ${assetUuid}`);
}

export async function runAssetCleanup() {
  const cutoffMs = Date.now() - ONE_DAY_MS;
  let orphans: Awaited<ReturnType<typeof findOrphanedAssets>>;
  try {
    orphans = await findOrphanedAssets(cutoffMs);
  } catch {
    THEI_SERVER.console.tag('Assets').error('Failed to query orphaned assets');
    return;
  }

  const orphanUuidSet = new Set(orphans.map((a) => a.assetUuid));

  for (const asset of orphans) {
    const preview =
      asset.type === AssetType.Video
        ? (
            await THEI_SERVER.assets.usages.findByContainer(
              'asset',
              asset.assetUuid,
            )
          ).find((usage) => usage.role === 'preview')?.asset
        : undefined;

    await deleteOrphanedAsset(asset.assetUuid, asset.extension);

    if (!preview) continue;

    await THEI_SERVER.assets.usages.detach(
      preview.assetUuid,
      'asset',
      asset.assetUuid,
      'preview',
    );
    if (!orphanUuidSet.has(preview.assetUuid)) {
      await deleteOrphanedAsset(preview.assetUuid, preview.extension);
    }
  }
}
