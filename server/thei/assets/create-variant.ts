import { createError } from 'h3';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import type {
  AssetMeta,
  ImageAssetMeta,
  OtherAssetMeta,
  VideoAssetMeta,
} from '#layers/thei/shared/asset';
import {
  AssetSettingsError,
  buildAssetSettingsKey,
  resolveAssetUploadSettings,
  type AssetTransformSource,
  type AssetUploadRequest,
  type AssetUploadSettings,
} from '#layers/thei/shared/asset-upload-settings';
import { canZipAssetExtension } from '#layers/thei/shared/asset-upload-zip';
import {
  getImageDimensions,
  inspectVideoFile,
  processFileZipAsset,
  processMediaTransformAsset,
  processOriginalAsset,
  videoSourceInfo,
  type AssetProcessOptions,
  type AssetSourceFile,
  type ProcessedAsset,
} from './process';
import { isProcessingQueued, withProcessingSlot } from './queue';
import { assetBytesHash, type AssetBytes } from './bytes';
import {
  attachMediaPreviewUsage,
  buildAssetVariantInfo,
  createMediaPreviewAsset,
  discardAssetScratch,
  storeAsset,
} from './storage';

export interface CreateAssetVariantInput {
  /** The upload staged on disk. Never read into memory as a whole. */
  source: AssetSourceFile;
  familyUuid: string;
  sourceType: AssetType;
  settings: AssetUploadRequest;
  onProgress?: (progress: number) => void;
  onQueued?: () => void;
  /** Aborted when nobody waits for the result any more. */
  signal?: AbortSignal;
}

export function validateAssetVariantSettings(
  type: AssetType,
  extension: string,
  settings: AssetUploadRequest,
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

/**
 * Derives and stores one variant.
 *
 * Everything that reads or writes media — probing the source, encoding, the
 * preview — runs inside one processing slot, so the limiter bounds the whole
 * job and not only its middle.
 */
export async function createAssetVariant(
  input: CreateAssetVariantInput,
): Promise<AssetUploadResponse> {
  validateAssetVariantSettings(
    input.sourceType,
    input.source.extension,
    input.settings,
  );

  if (isProcessingQueued(input.sourceType)) input.onQueued?.();
  return await withProcessingSlot(
    input.sourceType,
    async () => {
      const known =
        input.settings.type === 'image-transform' ||
        input.settings.type === 'video-transform'
          ? await probeTransformSource(input.source, input.sourceType)
          : undefined;
      const settings = await resolveAssetRequest(
        input.settings,
        input.source,
        input.sourceType,
        known,
      );
      const processed = await renderAsset(input.source, settings, input);
      return await commitProcessedAsset({
        processed,
        settings,
        familyUuid: input.familyUuid,
        source: input.source,
        transformSource: known,
      });
    },
    { signal: input.signal },
  );
}

/**
 * Resolves a request against the source it is applied to, so the stored recipe
 * names the exact region and size written and one output has one key.
 */
export async function resolveAssetRequest(
  request: AssetUploadRequest,
  source: AssetSourceFile,
  sourceType: AssetType,
  known?: AssetTransformSource,
): Promise<AssetUploadSettings> {
  if (request.type === 'original' || request.type === 'file-zip') {
    return resolveAssetUploadSettings(request);
  }
  try {
    return resolveAssetUploadSettings(
      request,
      known ?? (await probeTransformSource(source, sourceType)),
    );
  } catch (error) {
    if (error instanceof AssetSettingsError) {
      throw createError({ statusCode: 400, message: error.message });
    }
    throw error;
  }
}

/** What a transform needs to know about a media source, read from the file. */
export async function probeTransformSource(
  source: AssetSourceFile,
  sourceType: AssetType,
): Promise<AssetTransformSource> {
  if (sourceType === AssetType.Video) {
    const inspected = await inspectVideoFile(source.path).catch(
      () => undefined,
    );
    if (!inspected?.width || !inspected.height) {
      throw createError({ statusCode: 400, message: 'Invalid video file' });
    }
    return {
      width: inspected.width,
      height: inspected.height,
      hasAudio: inspected.hasAudio,
      ...videoSourceInfo(inspected, source.size),
    };
  }
  const dimensions = await getImageDimensions(source.path).catch(
    () => ({}) as { width?: number; height?: number },
  );
  if (!dimensions.width || !dimensions.height) {
    throw createError({ statusCode: 400, message: 'Invalid image file' });
  }
  return {
    width: dimensions.width,
    height: dimensions.height,
    isVector: source.extension.toLowerCase() === 'svg',
  };
}

/** Produces the bytes of a variant, without storing them. */
export async function renderAsset(
  source: AssetSourceFile,
  settings: AssetUploadSettings,
  options: AssetProcessOptions = {},
): Promise<ProcessedAsset> {
  if (settings.type === 'original') {
    return await processOriginalAsset(source);
  }

  if (settings.type === 'file-zip') {
    return await processFileZipAsset(source, settings, options);
  }

  return await processMediaTransformAsset(source, settings, options);
}

/**
 * Stores rendered bytes as a variant of a family.
 *
 * An identical variant already stored is returned as it is, before any
 * preview is made for bytes that would be thrown away.
 */
export async function commitProcessedAsset(input: {
  processed: ProcessedAsset;
  settings: AssetUploadSettings;
  familyUuid: string;
  source: Pick<AssetSourceFile, 'extension' | 'size'>;
  /** The size the transform was made from, recorded for its description. */
  transformSource?: AssetTransformSource;
}): Promise<AssetUploadResponse> {
  const { processed, settings } = input;
  const settingsKey = buildAssetSettingsKey(settings);
  const existing = await THEI_SERVER.assets.findByIdentity(
    input.familyUuid,
    assetBytesHash(processed.bytes),
    settingsKey,
  );
  if (existing) {
    await THEI_SERVER.assets.touch(existing.assetUuid);
    await discardAssetScratch(processed.bytes);
    return { ...(await buildAssetVariantInfo(existing)), created: false };
  }

  const { meta, previewAssetUuid } = await buildProcessedAssetMeta(
    processed.bytes,
    processed.type,
    {
      ...processed.dimensions,
      ...(input.transformSource &&
      (settings.type === 'image-transform' ||
        settings.type === 'video-transform')
        ? {
            sourceDimensions: {
              width: input.transformSource.width,
              height: input.transformSource.height,
            },
          }
        : {}),
    },
    settings,
    processed.hasAudio,
    input.source,
    processed.video,
  );

  const stored = await storeAsset({
    bytes: processed.bytes,
    extension: processed.extension,
    familyUuid: input.familyUuid,
    settingsKey,
    settings,
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

async function buildProcessedAssetMeta(
  bytes: AssetBytes,
  type: AssetType,
  dimensions: {
    width?: number;
    height?: number;
    sourceDimensions?: { width: number; height: number };
  },
  settings: AssetUploadSettings,
  hasAudio?: boolean,
  sourceFile?: { extension: string; size: number },
  video?: { duration?: number; fps?: number; bitrate?: number },
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
    const preview = await createMediaPreviewAsset(bytes, AssetType.Video, {
      duration: video?.duration,
    });
    const meta: VideoAssetMeta = {
      ...dimensions,
      ...(hasAudio !== undefined ? { hasAudio } : {}),
      ...(video?.duration ? { duration: video.duration } : {}),
      ...(video?.fps ? { fps: video.fps } : {}),
      ...(video?.bitrate ? { bitrate: video.bitrate } : {}),
      ...(preview.accent !== undefined ? { accent: preview.accent } : {}),
      ...(preview.frameAt !== undefined ? { previewAt: preview.frameAt } : {}),
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

  const { sourceDimensions: _source, ...size } = dimensions;
  return { meta: size };
}
