import { AssetType } from '../../../shared/asset';
import type { AssetCropRect } from '../../../shared/asset-crop';
import {
  ASSET_IMAGE_FORMATS,
  ASSET_TRANSFORM_MAX_DIMENSION,
  createFileZipSettings,
  createOriginalAssetSettings,
  type AssetFileZipSettings,
  type AssetImageFormat,
  type AssetImageTransformRequest,
  type AssetOriginalSettings,
  type AssetTransformRequestGeometry,
  type AssetUploadRequest,
  type AssetVideoTransformRequest,
} from '../../../shared/asset-upload-settings';
import {
  ASSET_UPLOAD_DEFAULT_MAX_SIZE,
  isAssetUploadLimitPolicy,
  resolveAssetMaxSize,
  type AssetUploadLimitPolicy,
} from '../../../shared/asset-upload-limits';
import { normalizeAssetExtension } from '../../../shared/assets/formats';

export const ASSET_UPLOAD_MAX_DIMENSION = ASSET_TRANSFORM_MAX_DIMENSION;
/** Largest source coordinate a crop may name; checked against the real file later. */
const ASSET_CROP_MAX_COORDINATE = 65535;
export const ASSET_UPLOAD_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/**
 * Reads the settings a request asks for.
 *
 * Only the shape is checked here. Whether a crop lies inside the source and
 * what size the output really is are decided once the source has been probed,
 * by `resolveAssetUploadSettings`.
 */
export function parseAssetUploadSettings(value: string): AssetUploadRequest {
  let settings: unknown;
  try {
    settings = JSON.parse(value);
  } catch {
    throwUploadRequestError('Invalid settings JSON');
  }

  if (!isRecord(settings)) {
    throwUploadRequestError('Invalid upload settings');
  }

  if (isOriginalSettings(settings)) {
    return createOriginalAssetSettings();
  }

  if (isImageTransformRequest(settings)) {
    return {
      type: 'image-transform',
      quality: settings.quality,
      ...pickGeometry(settings),
      ...(settings.format ? { format: settings.format } : {}),
    };
  }

  if (isVideoTransformRequest(settings)) {
    return {
      type: 'video-transform',
      quality: settings.quality,
      ...pickGeometry(settings),
      stripAudio: settings.stripAudio,
      fastConversion: settings.fastConversion,
    };
  }

  if (isFileZipSettings(settings)) {
    return createFileZipSettings();
  }

  throwUploadRequestError('Invalid upload settings');
}

export function parseOptionalPositiveInt(value: string): number | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) {
    throwUploadRequestError('Invalid maxSizeBytes field');
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throwUploadRequestError('Invalid maxSizeBytes field');
  }
  return parsed;
}

export function parseSizeLimitPolicy(
  value: string,
): AssetUploadLimitPolicy | undefined {
  if (!value) return undefined;
  if (isAssetUploadLimitPolicy(value)) return value;
  throwUploadRequestError('Invalid sizeLimitPolicy field');
}

export function resolveMaxSizeBytes(
  policy: AssetUploadLimitPolicy | undefined,
  requestedMaxSizeBytes: number | undefined,
): number {
  return resolveAssetMaxSize(policy, requestedMaxSizeBytes);
}

export function parseAcceptedExtensions(
  value: string,
): string[] | '*' | undefined {
  const normalizedValue = value.trim();
  if (!normalizedValue) return undefined;
  if (normalizedValue === '*') return '*';
  try {
    const parsed = JSON.parse(normalizedValue);
    if (
      Array.isArray(parsed) &&
      parsed.every((extension) => typeof extension === 'string')
    ) {
      const normalized = parsed.map(normalizeAssetExtension).filter(Boolean);
      if (normalized.includes('*')) return '*';
      return normalized;
    }
  } catch {
    // handled below
  }
  throwUploadRequestError('Invalid acceptedExtensions field');
}

export function validateUploadContentLength(value: string | undefined) {
  if (!value) return;
  if (!/^\d+$/.test(value)) return;

  const contentLength = Number.parseInt(value, 10);
  const maxContentLength =
    ASSET_UPLOAD_DEFAULT_MAX_SIZE + ASSET_UPLOAD_MULTIPART_OVERHEAD_BYTES;

  if (contentLength > maxContentLength) {
    throwUploadRequestError('File exceeds the maximum allowed size', 413);
  }
}

export function validateSizeLimitPolicy(
  policy: AssetUploadLimitPolicy | undefined,
  type: AssetType,
) {
  if (
    policy === 'media' &&
    type !== AssetType.Image &&
    type !== AssetType.Video
  ) {
    throwUploadRequestError(
      'Selected upload policy only allows images and videos',
    );
  }
}

export function validateFileInput(input: {
  extension: string;
  size: number;
  maxSizeBytes?: number;
  acceptedExtensions?: string[] | '*';
}) {
  if (
    input.acceptedExtensions &&
    input.acceptedExtensions !== '*' &&
    !input.acceptedExtensions.includes(normalizeAssetExtension(input.extension))
  ) {
    throwUploadRequestError(
      `File type .${input.extension || '?'} is not allowed`,
    );
  }

  if (input.maxSizeBytes !== undefined && input.size > input.maxSizeBytes) {
    throwUploadRequestError('File exceeds the maximum allowed size');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isQuality(value: unknown): value is number {
  return typeof value === 'number' && value >= 10 && value <= 100;
}

function isDimensionValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= ASSET_UPLOAD_MAX_DIMENSION
  );
}

function isDimensions(
  value: unknown,
): value is { width?: number; height?: number } {
  if (!isRecord(value)) return false;
  return (
    (value.width === undefined || isDimensionValue(value.width)) &&
    (value.height === undefined || isDimensionValue(value.height))
  );
}

function isCropCoordinate(value: unknown, min: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= ASSET_CROP_MAX_COORDINATE
  );
}

function isCropRect(value: unknown): value is AssetCropRect {
  if (!isRecord(value)) return false;
  return (
    isCropCoordinate(value.left, 0) &&
    isCropCoordinate(value.top, 0) &&
    isCropCoordinate(value.width, 1) &&
    isCropCoordinate(value.height, 1)
  );
}

/**
 * A turn, a crop and an output size. The resize fields of a page built before
 * crops existed are still accepted, so an admin tab left open across an update
 * keeps working until it reloads.
 */
function hasGeometry(settings: Record<string, unknown>): boolean {
  return (
    isDimensions(settings.dimensions) &&
    (settings.rotation === undefined ||
      [0, 90, 180, 270].includes(settings.rotation as number)) &&
    (settings.crop === undefined || isCropRect(settings.crop)) &&
    (settings.stretch === undefined || typeof settings.stretch === 'boolean') &&
    (settings.resizeMode === undefined ||
      settings.resizeMode === 'inside' ||
      settings.resizeMode === 'cover') &&
    (settings.allowUpscale === undefined ||
      typeof settings.allowUpscale === 'boolean')
  );
}

function pickGeometry(
  settings: AssetTransformRequestGeometry,
): AssetTransformRequestGeometry {
  return {
    dimensions: {
      ...(settings.dimensions.width
        ? { width: settings.dimensions.width }
        : {}),
      ...(settings.dimensions.height
        ? { height: settings.dimensions.height }
        : {}),
    },
    ...(settings.rotation ? { rotation: settings.rotation } : {}),
    ...(settings.stretch ? { stretch: true } : {}),
    ...(settings.crop
      ? {
          crop: {
            left: settings.crop.left,
            top: settings.crop.top,
            width: settings.crop.width,
            height: settings.crop.height,
          },
        }
      : {}),
    ...(settings.resizeMode ? { resizeMode: settings.resizeMode } : {}),
  };
}

function isOriginalSettings(
  settings: unknown,
): settings is AssetOriginalSettings {
  if (!isRecord(settings)) return false;
  return settings.type === 'original';
}

function isImageFormat(value: unknown): value is AssetImageFormat | undefined {
  return (
    value === undefined ||
    ASSET_IMAGE_FORMATS.includes(value as AssetImageFormat)
  );
}

function isImageTransformRequest(
  settings: unknown,
): settings is AssetImageTransformRequest {
  if (!isRecord(settings)) return false;
  return (
    settings.type === 'image-transform' &&
    isQuality(settings.quality) &&
    isImageFormat(settings.format) &&
    hasGeometry(settings)
  );
}

function isVideoTransformRequest(
  settings: unknown,
): settings is AssetVideoTransformRequest {
  if (!isRecord(settings)) return false;
  return (
    settings.type === 'video-transform' &&
    isQuality(settings.quality) &&
    hasGeometry(settings) &&
    typeof settings.stripAudio === 'boolean' &&
    typeof settings.fastConversion === 'boolean'
  );
}

function isFileZipSettings(
  settings: unknown,
): settings is AssetFileZipSettings {
  if (!isRecord(settings)) return false;
  return settings.type === 'file-zip';
}

function throwUploadRequestError(message: string, statusCode = 400): never {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  throw error;
}
