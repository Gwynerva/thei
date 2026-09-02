import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import type {
  AssetMeta,
  ImageAssetMeta,
  OtherAssetMeta,
  VideoAssetMeta,
} from '#layers/thei/shared/asset';
import {
  buildAssetSettingsKey,
  type AssetUploadSettings,
} from '#layers/thei/shared/asset-upload-settings';
import { canZipAssetExtension } from '#layers/thei/shared/asset-upload-zip';
import {
  processFileZipAsset,
  processMediaTransformAsset,
  processOriginalAsset,
} from './process';
import {
  attachMediaPreviewUsage,
  buildAssetVariantInfo,
  createMediaPreviewAsset,
  storeAsset,
} from './storage';

export interface CreateAssetVariantInput {
  buffer: Buffer;
  filename: string;
  extension: string;
  familyUuid: string;
  sourceType: AssetType;
  settings: AssetUploadSettings;
  onProgress?: (progress: number) => void;
}

export function validateAssetVariantSettings(
  type: AssetType,
  extension: string,
  settings: AssetUploadSettings,
) {
  if (settings.type === 'image-transform' && type !== AssetType.Image) {
    throw createError({
      statusCode: 400,
      message: 'Selected image settings do not match the asset type',
    });
  }
  if (settings.type === 'video-transform' && type !== AssetType.Video) {
    throw createError({
      statusCode: 400,
      message: 'Selected video settings do not match the asset type',
    });
  }
  if (
    settings.type === 'file-zip' &&
    (type !== AssetType.Other || !canZipAssetExtension(extension))
  ) {
    throw createError({
      statusCode: 400,
      message: 'Selected zip settings do not match the asset type',
    });
  }
}

export async function createAssetVariant(
  input: CreateAssetVariantInput,
): Promise<AssetUploadResponse> {
  validateAssetVariantSettings(
    input.sourceType,
    input.extension,
    input.settings,
  );

  const processed = await processAsset(input);
  const { meta, previewAssetUuid } = await buildProcessedAssetMeta(
    processed.buffer,
    processed.extension,
    processed.type,
    processed.dimensions,
    input.settings,
    processed.hasAudio,
    {
      extension: input.extension,
      size: input.buffer.length,
      name: input.filename,
    },
  );

  const stored = await storeAsset({
    buffer: processed.buffer,
    extension: processed.extension,
    familyUuid: input.familyUuid,
    settingsKey: buildAssetSettingsKey(input.settings),
    settingsVersion: input.settings.version,
    settings: input.settings,
    type: processed.type,
    meta,
  });

  if (previewAssetUuid) {
    await attachMediaPreviewUsage(stored.asset.assetUuid, previewAssetUuid);
  }

  return {
    ...(await buildAssetVariantInfo(stored.asset)),
    created: stored.created,
  };
}

async function processAsset(input: CreateAssetVariantInput) {
  if (input.settings.type === 'original') {
    return await processOriginalAsset(input.buffer, input.extension);
  }

  if (input.settings.type === 'file-zip') {
    return await processFileZipAsset(
      input.buffer,
      input.filename,
      input.settings,
      { onProgress: input.onProgress },
    );
  }

  return await processMediaTransformAsset(input.buffer, input.settings, {
    onProgress: input.onProgress,
  });
}

async function buildProcessedAssetMeta(
  buffer: Buffer,
  extension: string,
  type: AssetType,
  dimensions: { width?: number; height?: number },
  settings: AssetUploadSettings,
  hasAudio?: boolean,
  sourceFile?: { extension: string; size: number; name?: string },
): Promise<{ meta: AssetMeta | null; previewAssetUuid?: string }> {
  if (type === AssetType.Image) {
    const preview = await createMediaPreviewAsset(buffer, AssetType.Image);
    const meta: ImageAssetMeta = {
      ...dimensions,
      ...(sourceFile?.name ? { originalName: sourceFile.name } : {}),
      ...(preview.accentHue !== undefined
        ? { accentHue: preview.accentHue }
        : {}),
    };
    return { meta, previewAssetUuid: preview.previewAssetUuid };
  }

  if (type === AssetType.Video) {
    const preview = await createMediaPreviewAsset(buffer, AssetType.Video);
    const meta: VideoAssetMeta = {
      ...dimensions,
      ...(sourceFile?.name ? { originalName: sourceFile.name } : {}),
      audio: hasAudio === true ? 'keep' : 'none',
      ...(preview.accentHue !== undefined
        ? { accentHue: preview.accentHue }
        : {}),
    };
    return { meta, previewAssetUuid: preview.previewAssetUuid };
  }

  if (settings.type === 'file-zip' && sourceFile) {
    const meta: OtherAssetMeta = {
      archivedOriginal: {
        extension: sourceFile.extension,
        size: sourceFile.size,
        ...(sourceFile.name ? { name: sourceFile.name } : {}),
      },
    };
    return { meta };
  }

  if (type === AssetType.Other && sourceFile) {
    return {
      meta: {
        ...(sourceFile.name ? { originalName: sourceFile.name } : {}),
      } satisfies OtherAssetMeta,
    };
  }

  return { meta: Object.keys(dimensions).length > 0 ? dimensions : null };
}
