import { readFile } from 'node:fs/promises';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { assetSourceName } from '#layers/thei/shared/asset';
import type { AssetUploadSettings } from '#layers/thei/shared/asset-upload-settings';
import { createAssetVariant } from '../../../../thei/assets/create-variant';
import { parseAssetUploadSettings } from '../../../../thei/assets/upload-request';
import {
  clearAssetUploadProgress,
  setAssetUploadProgress,
} from '../../../../thei/assets/progress';

interface TransformAssetRequest {
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
    if (!asset) {
      throw createError({ statusCode: 404, message: 'Asset not found' });
    }

    const settings = parseAssetUploadSettings(JSON.stringify(body.settings));
    const filePath = THEI_SERVER.assets.filePath(
      asset.assetUuid,
      asset.extension,
    );
    const buffer = await readFile(filePath).catch(() => null);
    if (!buffer) {
      throw createError({ statusCode: 404, message: 'Asset file not found' });
    }

    try {
      return await createAssetVariant({
        buffer,
        filename:
          assetSourceName(asset.meta) ?? `${asset.slug}.${asset.extension}`,
        extension: asset.extension,
        familyUuid: asset.familyUuid,
        sourceType: asset.type,
        settings,
        onProgress: (progress) =>
          setAssetUploadProgress(body.uploadId, {
            phase: 'processing',
            progress,
          }),
      });
    } finally {
      clearAssetUploadProgress(body.uploadId);
    }
  },
);
