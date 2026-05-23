import { rm } from 'node:fs/promises';
import { findOrphanedAssets } from './repository/find-orphaned';
import { deleteAsset } from './repository/delete';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function runAssetCleanup() {
  const cutoffMs = Date.now() - ONE_DAY_MS;
  let orphans: ReturnType<typeof findOrphanedAssets>;
  try {
    orphans = findOrphanedAssets(cutoffMs);
  } catch {
    THEI_SERVER.console.tag('Assets').error('Failed to query orphaned assets');
    return;
  }
  for (const asset of orphans) {
    const filePath = THEI_SERVER.assets.filePath(
      asset.assetUuid,
      asset.extension,
    );
    await rm(filePath, { force: true }).catch(() => {});
    try {
      deleteAsset(asset.assetUuid);
    } catch {
      THEI_SERVER.console
        .tag('Assets')
        .error(
          `Failed to delete DB record for orphaned asset ${asset.assetUuid}`,
        );
      continue;
    }
    THEI_SERVER.console
      .tag('Assets')
      .log(`Cleaned up orphaned asset ${asset.assetUuid}`);
  }
}
