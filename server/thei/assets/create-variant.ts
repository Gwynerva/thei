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
  inspectVideoFile,
  processFileZipAsset,
  processMediaTransformAsset,
  processOriginalAsset,
  type AssetSourceFile,
} from './process';
import { isProcessingQueued, withProcessingSlot } from './queue';
import type { AssetBytes } from './bytes';
import {
  attachMediaPreviewUsage,
  buildAssetVariantInfo,
  createMediaPreviewAsset,
  storeAsset,
} from './storage';

export interface CreateAssetVariantInput {
  /** The upload staged on disk. Never read into memory as a whole. */
  source: AssetSourceFile;
  familyUuid: string;
  sourceType: AssetType;
  settings: AssetUploadSettings;
  onProgress?: (progress: number) => void;
  onQueued?: () => void;
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
  requested: CreateAssetVariantInput,
): Promise<AssetUploadResponse> {
  validateAssetVariantSettings(
    requested.sourceType,
    requested.source.extension,
    requested.settings,
  );
  const input = {
    ...requested,
    settings: await normalizeAudioSettings(requested),
  };

  if (isProcessingQueued(input.sourceType)) input.onQueued?.();
  const processed = await withProcessingSlot(
    input.sourceType,
    async () => await processAsset(input),
  );

  const { meta, previewAssetUuid } = await buildProcessedAssetMeta(
    processed.bytes,
    processed.extension,
    processed.type,
    processed.dimensions,
    input.settings,
    processed.hasAudio,
    {
      extension: input.source.extension,
      size: input.source.size,
    },
  );

  const stored = await storeAsset({
    bytes: processed.bytes,
    extension: processed.extension,
    familyUuid: input.familyUuid,
    settingsKey: buildAssetSettingsKey(input.settings),
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

/**
 * Removing audio from a silent source changes nothing, so the request is
 * described as keeping it: both spellings must map to one settings key.
 */
async function normalizeAudioSettings(
  input: CreateAssetVariantInput,
): Promise<AssetUploadSettings> {
  const settings = input.settings;
  if (settings.type !== 'video-transform' || !settings.stripAudio) {
    return settings;
  }
  const inspected = await inspectVideoFile(input.source.path).catch(
    () => undefined,
  );
  return inspected && !inspected.hasAudio
    ? { ...settings, stripAudio: false }
    : settings;
}

async function processAsset(input: CreateAssetVariantInput) {
  if (input.settings.type === 'original') {
    return await processOriginalAsset(input.source);
  }

  if (input.settings.type === 'file-zip') {
    return await processFileZipAsset(input.source, input.settings, {
      onProgress: input.onProgress,
    });
  }

  return await processMediaTransformAsset(input.source, input.settings, {
    onProgress: input.onProgress,
  });
}

async function buildProcessedAssetMeta(
  bytes: AssetBytes,
  extension: string,
  type: AssetType,
  dimensions: { width?: number; height?: number },
  settings: AssetUploadSettings,
  hasAudio?: boolean,
  sourceFile?: { extension: string; size: number },
): Promise<{ meta: AssetMeta | null; previewAssetUuid?: string }> {
  if (type === AssetType.Image) {
    const preview = await createMediaPreviewAsset(bytes, AssetType.Image);
    const meta: ImageAssetMeta = {
      ...dimensions,
      ...(preview.accent !== undefined ? { accent: preview.accent } : {}),
    };
    return { meta, previewAssetUuid: preview.previewAssetUuid };
  }

  if (type === AssetType.Video) {
    const preview = await createMediaPreviewAsset(bytes, AssetType.Video);
    const meta: VideoAssetMeta = {
      ...dimensions,
      ...(hasAudio !== undefined ? { hasAudio } : {}),
      ...(preview.accent !== undefined ? { accent: preview.accent } : {}),
    };
    return { meta, previewAssetUuid: preview.previewAssetUuid };
  }

  if (settings.type === 'file-zip' && sourceFile) {
    const meta: OtherAssetMeta = {
      archivedOriginal: {
        extension: sourceFile.extension,
        size: sourceFile.size,
      },
    };
    return { meta };
  }

  return { meta: { ...dimensions } };
}
