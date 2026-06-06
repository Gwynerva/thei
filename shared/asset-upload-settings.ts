import { AssetType } from './asset';

export const ASSET_UPLOAD_SETTINGS_VERSION = 4 as const;

export type AssetUploadSettingsVersion = typeof ASSET_UPLOAD_SETTINGS_VERSION;

export interface AssetUploadDimensions {
  width?: number;
  height?: number;
}

export interface AssetOriginalSettings {
  version: AssetUploadSettingsVersion;
  type: 'original';
}

export interface AssetImageTransformSettings {
  version: AssetUploadSettingsVersion;
  type: 'image-transform';
  quality: number;
  dimensions: AssetUploadDimensions;
}

export interface AssetVideoTransformSettings {
  version: AssetUploadSettingsVersion;
  type: 'video-transform';
  quality: number;
  dimensions: AssetUploadDimensions;
  audio: 'keep' | 'strip';
  mode: 'quality' | 'fast';
}

export type AssetTransformSettings =
  | AssetImageTransformSettings
  | AssetVideoTransformSettings;

export type AssetUploadSettings =
  | AssetOriginalSettings
  | AssetTransformSettings;

export type AssetSettingsForType<TType extends AssetType> =
  TType extends AssetType.Image
    ? AssetOriginalSettings | AssetImageTransformSettings
    : TType extends AssetType.Video
      ? AssetOriginalSettings | AssetVideoTransformSettings
      : AssetOriginalSettings;

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

export function createOriginalAssetSettings(): AssetOriginalSettings {
  return {
    version: ASSET_UPLOAD_SETTINGS_VERSION,
    type: 'original',
  };
}

export function createImageTransformSettings(
  quality: number,
  dimensions: AssetUploadDimensions,
): AssetImageTransformSettings {
  return {
    version: ASSET_UPLOAD_SETTINGS_VERSION,
    type: 'image-transform',
    quality: normalizeAssetUploadQuality(quality),
    dimensions: normalizeAssetUploadDimensions(dimensions),
  };
}

export function createVideoTransformSettings(
  quality: number,
  dimensions: AssetUploadDimensions,
  options: {
    audio: AssetVideoTransformSettings['audio'];
    mode: AssetVideoTransformSettings['mode'];
  },
): AssetVideoTransformSettings {
  return {
    version: ASSET_UPLOAD_SETTINGS_VERSION,
    type: 'video-transform',
    quality: normalizeAssetUploadQuality(quality),
    dimensions: normalizeAssetUploadDimensions(dimensions),
    audio: options.audio,
    mode: options.mode,
  };
}

export function buildAssetSettingsKey(settings: AssetUploadSettings): string {
  if (settings.type === 'original') {
    return `v${settings.version}:original`;
  }

  const width = settings.dimensions.width ?? 0;
  const height = settings.dimensions.height ?? 0;
  const baseParts = [
    `v${settings.version}`,
    settings.type,
    `q${settings.quality}`,
    `w${width}`,
    `h${height}`,
  ];

  if (settings.type === 'video-transform') {
    return [
      ...baseParts,
      `audio:${settings.audio}`,
      `mode:${settings.mode}`,
    ].join(':');
  }

  return baseParts.join(':');
}
