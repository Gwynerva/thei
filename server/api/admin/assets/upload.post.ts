import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import type {
  AssetMeta,
  ImageAssetMeta,
  OtherAssetMeta,
  VideoAssetMeta,
} from '#layers/thei/shared/asset';
import {
  ASSET_UPLOAD_SETTINGS_VERSION,
  buildAssetSettingsKey,
  type AssetFileZipSettings,
  type AssetImageTransformSettings,
  type AssetOriginalSettings,
  type AssetUploadSettings,
  type AssetVideoTransformSettings,
} from '#layers/thei/shared/asset-upload-settings';
import { getPathExtension } from '#layers/thei/shared/assets/extensions';
import { canZipAssetExtension } from '#layers/thei/shared/asset-upload-zip';
import { extractDominantHue } from '../../../thei/assets/image-color';
import {
  inferAssetType,
  processFileZipAsset,
  processMediaTransformAsset,
  processOriginalAsset,
} from '../../../thei/assets/process';
import {
  buildAssetVariantInfo,
  attachVideoPreviewUsage,
  createVideoPreviewAsset,
  deleteStoredAsset,
  sha256,
  storeAsset,
} from '../../../thei/assets/storage';
import {
  clearAssetUploadProgress,
  setAssetUploadProgress,
} from '../../../thei/assets/progress';

export default defineEventHandler(
  async (event): Promise<AssetUploadResponse> => {
    let uploadId: string | undefined;
    try {
      const parts = await readMultipartFormData(event);
      if (!parts) {
        throw createError({ statusCode: 400, message: 'No multipart data' });
      }

      const filePart = parts.find((part) => part.name === 'file');
      const rawHash = readPartString(parts, 'rawHash');
      const settings = parseSettings(readPartString(parts, 'settings'));
      const previousAssetUuid = readPartString(
        parts,
        'previousAssetUuid',
        false,
      );
      uploadId = readPartString(parts, 'uploadId', false);
      const maxSizeBytes = parseOptionalInt(
        readPartString(parts, 'maxSizeBytes', false),
      );
      const acceptedExtensions = parseAcceptedExtensions(
        readPartString(parts, 'acceptedExtensions', false),
      );

      if (!filePart?.data || !filePart.filename || !rawHash) {
        throw createError({
          statusCode: 400,
          message: 'Missing required fields: file, rawHash, settings',
        });
      }

      if (sha256(filePart.data) !== rawHash) {
        throw createError({
          statusCode: 400,
          message: 'File hash does not match rawHash',
        });
      }

      const originalExtension = getPathExtension(filePart.filename);
      validateFileInput({
        extension: originalExtension,
        size: filePart.data.length,
        maxSizeBytes,
        acceptedExtensions,
      });
      const originalType = inferAssetType(originalExtension);

      if (
        settings.type === 'image-transform' &&
        originalType !== AssetType.Image
      ) {
        throw createError({
          statusCode: 400,
          message:
            'Selected image settings do not match the uploaded file type',
        });
      }

      if (
        settings.type === 'video-transform' &&
        originalType !== AssetType.Video
      ) {
        throw createError({
          statusCode: 400,
          message:
            'Selected video settings do not match the uploaded file type',
        });
      }

      if (
        settings.type === 'file-zip' &&
        (originalType !== AssetType.Other ||
          !canZipAssetExtension(originalExtension))
      ) {
        throw createError({
          statusCode: 400,
          message: 'Selected zip settings do not match the uploaded file type',
        });
      }

      const settingsKey = buildAssetSettingsKey(settings);
      const existing = await THEI_SERVER.assets.findBySettingsKey(
        rawHash,
        settingsKey,
      );

      if (existing) {
        await THEI_SERVER.assets.touch(existing.assetUuid);
        if (previousAssetUuid && previousAssetUuid !== existing.assetUuid) {
          await deleteStoredAsset(previousAssetUuid);
        }
        const variant = await buildAssetVariantInfo(existing);
        clearAssetUploadProgress(uploadId);
        return {
          ...variant,
          created: false,
        };
      }

      const processed = await processAsset(
        filePart.data,
        filePart.filename,
        originalExtension,
        settings,
        {
          onProgress: (progress) =>
            setAssetUploadProgress(uploadId, {
              phase: 'processing',
              progress,
            }),
        },
      );

      const { meta, previewAssetUuid } = await buildProcessedAssetMeta(
        processed.buffer,
        processed.extension,
        processed.type,
        processed.dimensions,
        settings,
        processed.hasAudio,
        {
          extension: originalExtension,
          size: filePart.data.length,
          name: filePart.filename,
        },
      );

      const storeResult = await storeAsset({
        buffer: processed.buffer,
        extension: processed.extension,
        rawHash,
        settingsKey,
        settingsVersion: settings.version,
        settings,
        type: processed.type,
        meta,
      });

      if (previewAssetUuid) {
        await attachVideoPreviewUsage(
          storeResult.asset.assetUuid,
          previewAssetUuid,
        );
      }

      if (
        previousAssetUuid &&
        previousAssetUuid !== storeResult.asset.assetUuid
      ) {
        await deleteStoredAsset(previousAssetUuid);
      }

      const variant = await buildAssetVariantInfo(storeResult.asset);
      clearAssetUploadProgress(uploadId);
      return {
        ...variant,
        created: storeResult.created,
      };
    } catch (error) {
      clearAssetUploadProgress(uploadId);
      throw error;
    }
  },
);

function readPartString(
  parts: NonNullable<Awaited<ReturnType<typeof readMultipartFormData>>>,
  name: string,
  required = true,
): string {
  const value = parts.find((part) => part.name === name)?.data.toString();
  if (required && !value) {
    throw createError({
      statusCode: 400,
      message: `Missing required field: ${name}`,
    });
  }
  return value ?? '';
}

async function processAsset(
  buffer: Buffer,
  filename: string,
  extension: string,
  settings: AssetUploadSettings,
  options: Parameters<typeof processMediaTransformAsset>[2],
) {
  if (settings.type === 'original') {
    return await processOriginalAsset(buffer, extension);
  }

  if (settings.type === 'file-zip') {
    return await processFileZipAsset(buffer, filename, settings, options);
  }

  return await processMediaTransformAsset(buffer, settings, options);
}

function parseSettings(value: string): AssetUploadSettings {
  let settings: unknown;
  try {
    settings = JSON.parse(value);
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid settings JSON' });
  }

  if (!isRecord(settings)) {
    throw createError({ statusCode: 400, message: 'Invalid upload settings' });
  }

  if (settings.version !== ASSET_UPLOAD_SETTINGS_VERSION) {
    throw createError({
      statusCode: 400,
      message: `Unsupported upload settings version: ${settings.version}`,
    });
  }

  if (isOriginalSettings(settings)) {
    return settings;
  }

  if (isImageTransformSettings(settings)) {
    return settings;
  }

  if (isVideoTransformSettings(settings)) {
    return settings;
  }

  if (isFileZipSettings(settings)) {
    return settings;
  }

  throw createError({ statusCode: 400, message: 'Invalid upload settings' });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isQuality(value: unknown): value is number {
  return typeof value === 'number' && value >= 10 && value <= 100;
}

function isDimensions(
  value: unknown,
): value is { width?: number; height?: number } {
  if (!isRecord(value)) return false;
  return (
    (value.width === undefined ||
      (typeof value.width === 'number' && value.width > 0)) &&
    (value.height === undefined ||
      (typeof value.height === 'number' && value.height > 0))
  );
}

function isResizeMode(value: unknown): value is 'inside' | 'cover' {
  return value === 'inside' || value === 'cover';
}

function hasResizeSettings(settings: Record<string, unknown>): boolean {
  return (
    isDimensions(settings.dimensions) &&
    isResizeMode(settings.resizeMode) &&
    typeof settings.allowUpscale === 'boolean'
  );
}

function isOriginalSettings(
  settings: Record<string, unknown>,
): settings is AssetOriginalSettings {
  return settings.type === 'original';
}

function isImageTransformSettings(
  settings: Record<string, unknown>,
): settings is AssetImageTransformSettings {
  return (
    settings.type === 'image-transform' &&
    isQuality(settings.quality) &&
    hasResizeSettings(settings)
  );
}

function isVideoTransformSettings(
  settings: Record<string, unknown>,
): settings is AssetVideoTransformSettings {
  return (
    settings.type === 'video-transform' &&
    isQuality(settings.quality) &&
    hasResizeSettings(settings) &&
    typeof settings.stripAudio === 'boolean' &&
    typeof settings.fastConversion === 'boolean'
  );
}

function isFileZipSettings(
  settings: Record<string, unknown>,
): settings is AssetFileZipSettings {
  return settings.type === 'file-zip';
}

function parseOptionalInt(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAcceptedExtensions(value: string): string[] | '*' | undefined {
  const normalizedValue = value.trim();
  if (!normalizedValue) return undefined;
  if (normalizedValue === '*') return '*';
  try {
    const parsed = JSON.parse(normalizedValue);
    if (
      Array.isArray(parsed) &&
      parsed.every((extension) => typeof extension === 'string')
    ) {
      const normalized = parsed.map(normalizeExtension).filter(Boolean);
      if (normalized.includes('*')) return '*';
      return normalized;
    }
  } catch {
    // handled below
  }
  throw createError({
    statusCode: 400,
    message: 'Invalid acceptedExtensions field',
  });
}

function validateFileInput(input: {
  extension: string;
  size: number;
  maxSizeBytes?: number;
  acceptedExtensions?: string[] | '*';
}) {
  if (
    input.acceptedExtensions &&
    input.acceptedExtensions !== '*' &&
    !input.acceptedExtensions.includes(normalizeExtension(input.extension))
  ) {
    throw createError({
      statusCode: 400,
      message: `File type .${input.extension || '?'} is not allowed`,
    });
  }

  if (input.maxSizeBytes !== undefined && input.size > input.maxSizeBytes) {
    throw createError({
      statusCode: 400,
      message: 'File exceeds the maximum allowed size',
    });
  }
}

function normalizeExtension(extension: string): string {
  return extension.trim().replace(/^\./, '').toLowerCase();
}

async function buildProcessedAssetMeta(
  buffer: Buffer,
  extension: string,
  type: AssetType,
  dimensions: { width?: number; height?: number },
  settings: AssetUploadSettings,
  hasAudio?: boolean,
  originalFile?: { extension: string; size: number; name?: string },
): Promise<{ meta: AssetMeta | null; previewAssetUuid?: string }> {
  if (type === AssetType.Image) {
    const dominantHue = await extractDominantHue(buffer, extension);
    const meta: ImageAssetMeta = {
      ...dimensions,
      ...(dominantHue !== undefined ? { dominantHue } : {}),
    };
    return { meta };
  }

  if (type === AssetType.Video) {
    const preview = await createVideoPreviewAsset(buffer);
    const meta: VideoAssetMeta = {
      ...dimensions,
      audio: hasAudio === true ? 'keep' : 'none',
      ...(preview.dominantHue !== undefined
        ? { dominantHue: preview.dominantHue }
        : {}),
    };
    return { meta, previewAssetUuid: preview.previewAssetUuid };
  }

  if (settings.type === 'file-zip' && originalFile) {
    const meta: OtherAssetMeta = {
      archivedOriginal: {
        extension: originalFile.extension,
        size: originalFile.size,
        ...(originalFile.name ? { name: originalFile.name } : {}),
      },
    };
    return { meta };
  }

  return { meta: Object.keys(dimensions).length > 0 ? dimensions : null };
}
