import { stat } from 'node:fs/promises';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import type { AssetUploadSettings } from '#layers/thei/shared/asset-upload-settings';
import { createAssetVariant } from '../../../../thei/assets/create-variant';
import { parseAssetUploadSettings } from '../../../../thei/assets/upload-request';
import { parseSelectionConstraints } from '../../../../thei/assets/library-query';
import {
  assertAssetSelection,
  confirmAssetSelection,
} from '../../../../thei/assets/selection';
import type { AssetSelectionConstraints } from '#layers/thei/shared/asset-library';
import {
  clearAssetUploadProgress,
  setAssetUploadProgress,
} from '../../../../thei/assets/progress';

interface TransformAssetRequest extends AssetSelectionConstraints {
  settings: AssetUploadSettings;
  uploadId?: string;
}

export default defineEventHandler(
  async (event): Promise<AssetUploadResponse> => {
    const body = await readBody<TransformAssetRequest>(event);
    const assetUuid = getRouterParam(event, 'assetUuid');
    const asset = assetUuid
      ? await THEI_SERVER.assets.findByUuid(assetUuid)
      : null;
    if (!asset?.settings) {
      throw createError({ statusCode: 404, message: 'Asset not found' });
    }

    const settings = parseAssetUploadSettings(JSON.stringify(body?.settings));
    const constraints = parseSelectionConstraints({ ...body });
    await confirmAssetSelection(asset.assetUuid, {});
    const filePath = THEI_SERVER.assets.filePath(
      asset.contentHash,
      asset.extension,
    );
    // The stored file is the source. It is read by sharp or ffmpeg directly,
    // never pulled into this process just to be handed back to them.
    const file = await stat(filePath).catch(() => null);
    if (!file?.isFile()) {
      throw createError({ statusCode: 404, message: 'Asset file not found' });
    }

    try {
      const result = await createAssetVariant({
        source: {
          path: filePath,
          size: asset.size,
          hash: asset.contentHash,
          extension: asset.extension,
          // The live library file, not scratch: storage must never move or
          // delete it while re-deriving a variant from it.
          owned: false,
        },
        familyUuid: asset.familyUuid,
        sourceType: asset.type,
        settings,
        onQueued: () =>
          setAssetUploadProgress(body.uploadId, { phase: 'queued' }),
        onProgress: (progress) =>
          setAssetUploadProgress(body.uploadId, {
            phase: 'processing',
            progress,
          }),
      });
      assertAssetSelection(result, constraints);
      return result;
    } finally {
      clearAssetUploadProgress(body.uploadId);
    }
  },
);
