import { AssetType } from './asset';

export const ASSET_UPLOAD_SETTINGS_VERSION = 5 as const;

export type AssetUploadSettingsVersion = typeof ASSET_UPLOAD_SETTINGS_VERSION;
export type AssetResizeMode = 'inside' | 'cover';

export interface AssetUploadDimensions {
  width?: number;
  height?: number;
}

export interface AssetResizeSettings {
  dimensions: AssetUploadDimensions;
  resizeMode: AssetResizeMode;
  allowUpscale: boolean;
}

export interface AssetOriginalSettings {
  version: AssetUploadSettingsVersion;
  type: 'original';
}

export interface AssetImageTransformSettings extends AssetResizeSettings {
  version: AssetUploadSettingsVersion;
  type: 'image-transform';
  quality: number;
}

export interface AssetVideoTransformSettings extends AssetResizeSettings {
  version: AssetUploadSettingsVersion;
  type: 'video-transform';
  quality: number;
  stripAudio: boolean;
  fastConversion: boolean;
}

export interface AssetFileZipSettings {
  version: AssetUploadSettingsVersion;
  type: 'file-zip';
}

export type AssetTransformSettings =
  | AssetImageTransformSettings
  | AssetVideoTransformSettings;

export type AssetUploadSettings =
  | AssetOriginalSettings
  | AssetTransformSettings
  | AssetFileZipSettings;

export type AssetSettingsForType<TType extends AssetType> =
  TType extends AssetType.Image
    ? AssetOriginalSettings | AssetImageTransformSettings
    : TType extends AssetType.Video
      ? AssetOriginalSettings | AssetVideoTransformSettings
      : AssetOriginalSettings | AssetFileZipSettings;

export function normalizeAssetUploadDimensions(
  dimensions: AssetUploadDimensions,
): AssetUploadDimensions {
  return {
    ...(dimensions.width && dimensions.width > 0
      ? { width: Math.round(dimensions.width) }
      : {}),
    ...(dimensions.height && dimensions.height > 0
      ? { height: Math.round(dimensions.height) }
      : {}),
  };
}

export function normalizeAssetUploadQuality(quality: number): number {
  return Math.max(10, Math.min(100, Math.round(quality)));
}

export function normalizeAssetResizeMode(
  resizeMode: AssetResizeMode | undefined,
): AssetResizeMode {
  return resizeMode === 'cover' ? 'cover' : 'inside';
}

export function createOriginalAssetSettings(): AssetOriginalSettings {
  return {
    version: ASSET_UPLOAD_SETTINGS_VERSION,
    type: 'original',
  };
}

export function createImageTransformSettings(
  quality: number,
  dimensions: AssetUploadDimensions,
  options: {
    resizeMode?: AssetResizeMode;
    allowUpscale?: boolean;
  } = {},
): AssetImageTransformSettings {
  return {
    version: ASSET_UPLOAD_SETTINGS_VERSION,
    type: 'image-transform',
    quality: normalizeAssetUploadQuality(quality),
    dimensions: normalizeAssetUploadDimensions(dimensions),
    resizeMode: normalizeAssetResizeMode(options.resizeMode),
    allowUpscale: Boolean(options.allowUpscale),
  };
}

export function createVideoTransformSettings(
  quality: number,
  dimensions: AssetUploadDimensions,
  options: {
    stripAudio: boolean;
    fastConversion: boolean;
    resizeMode?: AssetResizeMode;
    allowUpscale?: boolean;
  },
): AssetVideoTransformSettings {
  return {
    version: ASSET_UPLOAD_SETTINGS_VERSION,
    type: 'video-transform',
    quality: normalizeAssetUploadQuality(quality),
    dimensions: normalizeAssetUploadDimensions(dimensions),
    resizeMode: normalizeAssetResizeMode(options.resizeMode),
    allowUpscale: Boolean(options.allowUpscale),
    stripAudio: Boolean(options.stripAudio),
    fastConversion: Boolean(options.fastConversion),
  };
}

export function createFileZipSettings(): AssetFileZipSettings {
  return {
    version: ASSET_UPLOAD_SETTINGS_VERSION,
    type: 'file-zip',
  };
}

export function buildAssetSettingsKey(settings: AssetUploadSettings): string {
  if (settings.type === 'original') {
    return `v${settings.version}:original`;
  }

  if (settings.type === 'file-zip') {
    return `v${settings.version}:file-zip`;
  }

  const width = settings.dimensions.width ?? 0;
  const height = settings.dimensions.height ?? 0;
  const baseParts = [
    `v${settings.version}`,
    settings.type,
    `q${settings.quality}`,
    `w${width}`,
    `h${height}`,
    `fit:${settings.resizeMode}`,
    `up:${settings.allowUpscale ? 1 : 0}`,
  ];

  if (settings.type === 'video-transform') {
    return [
      ...baseParts,
      `strip:${settings.stripAudio ? 1 : 0}`,
      `fast:${settings.fastConversion ? 1 : 0}`,
    ].join(':');
  }

  return baseParts.join(':');
}
