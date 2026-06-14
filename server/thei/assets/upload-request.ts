import { AssetType } from '../../../shared/asset';
import {
  ASSET_UPLOAD_SETTINGS_VERSION,
  createFileZipSettings,
  createImageTransformSettings,
  createOriginalAssetSettings,
  createVideoTransformSettings,
  type AssetFileZipSettings,
  type AssetImageTransformSettings,
  type AssetOriginalSettings,
  type AssetUploadSettings,
  type AssetVideoTransformSettings,
} from '../../../shared/asset-upload-settings';
import {
  ASSET_UPLOAD_DEFAULT_MAX_SIZE,
  ASSET_UPLOAD_LIMITS,
  isAssetUploadLimitPolicy,
  type AssetUploadLimitPolicy,
} from '../../../shared/asset-upload-limits';
import { normalizeAssetExtension } from '../../../shared/assets/formats';

export const ASSET_UPLOAD_MAX_DIMENSION = 8192;
export const ASSET_UPLOAD_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export function parseAssetUploadSettings(value: string): AssetUploadSettings {
  let settings: unknown;
  try {
    settings = JSON.parse(value);
  } catch {
    throwUploadRequestError('Invalid settings JSON');
  }

  if (!isRecord(settings)) {
    throwUploadRequestError('Invalid upload settings');
  }

  if (settings.version !== ASSET_UPLOAD_SETTINGS_VERSION) {
    throwUploadRequestError(
      `Unsupported upload settings version: ${settings.version}`,
    );
  }

  if (isOriginalSettings(settings)) {
    return createOriginalAssetSettings();
  }

  if (isImageTransformSettings(settings)) {
    return createImageTransformSettings(settings.quality, settings.dimensions, {
      resizeMode: settings.resizeMode,
      allowUpscale: settings.allowUpscale,
    });
  }

  if (isVideoTransformSettings(settings)) {
    return createVideoTransformSettings(settings.quality, settings.dimensions, {
      resizeMode: settings.resizeMode,
      allowUpscale: settings.allowUpscale,
      stripAudio: settings.stripAudio,
      fastConversion: settings.fastConversion,
    });
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
  if (parsed <= 0) {
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
  if (policy) return ASSET_UPLOAD_LIMITS[policy];
  if (requestedMaxSizeBytes === undefined) return ASSET_UPLOAD_DEFAULT_MAX_SIZE;
  return Math.min(requestedMaxSizeBytes, ASSET_UPLOAD_DEFAULT_MAX_SIZE);
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
    policy === 'project-media' &&
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

function throwUploadRequestError(message: string, statusCode = 400): never {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  throw error;
}
