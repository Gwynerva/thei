import { stat } from 'node:fs/promises';
import type { AssetDraftSource } from '#layers/thei/shared/api/asset-draft';
import { openDraft } from '../../../../../thei/assets/drafts';

/**
 * Opens a draft on a file already in the library.
 *
 * The stored file is read where it is. The draft never owns it, so nothing a
 * draft does can move or delete a library file.
 */
export default defineEventHandler(async (event): Promise<AssetDraftSource> => {
  const assetUuid = getRouterParam(event, 'assetUuid');
  const asset = assetUuid
    ? await THEI_SERVER.assets.findByUuid(assetUuid)
    : null;
  if (!asset?.settings) {
    throw createError({ statusCode: 404, message: 'Asset not found' });
  }
  const path = THEI_SERVER.assets.filePath(asset.contentHash, asset.extension);
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) {
    throw createError({ statusCode: 404, message: 'Asset file not found' });
  }

  return await openDraft({
    source: {
      path,
      size: asset.size,
      hash: asset.contentHash,
      extension: asset.extension,
      owned: false,
    },
    type: asset.type,
    familyUuid: asset.familyUuid,
  });
});
