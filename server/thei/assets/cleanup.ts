import { rm } from 'node:fs/promises';
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

  // Track which UUIDs are already in the orphan set so we don't double-delete.
  const orphanUuidSet = new Set(orphans.map((a) => a.assetUuid));

  for (const asset of orphans) {
    await deleteOrphanedAsset(asset.assetUuid, asset.extension);

    // If this is a video asset with a preview thumbnail, and the preview was not
    // independently caught by the orphan query (e.g. its touchedAt was bumped
    // recently by a dedup hit), delete it here as well — the video-preview link
    // exists only in meta JSON and is not reflected in asset_usages.
    const previewUuid = asset.meta?.previewAssetUuid;
    if (previewUuid && !orphanUuidSet.has(previewUuid)) {
      const preview = await THEI_SERVER.assets.findByUuid(previewUuid);
      if (preview) {
        await deleteOrphanedAsset(preview.assetUuid, preview.extension);
      }
    }
  }
}
