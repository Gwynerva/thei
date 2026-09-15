import { AssetType } from './asset';

export type AssetResizeMode = 'inside' | 'cover';

/**
 * Output format for an image transform.
 *
 * A requested parameter, not an engine setting: it belongs in the settings key
 * because two formats are genuinely two different derivations. AVIF is the
 * default; WebP stays available for the handful of places where AVIF is not
 * reliably consumed, such as a browser tab icon.
 */
export type AssetImageFormat = 'avif' | 'webp';

export const DEFAULT_ASSET_IMAGE_FORMAT: AssetImageFormat = 'avif';

/**
 * Long side below which WebP still beats AVIF.
 *
 * AVIF's container overhead does not amortize on a small icon. Measured on
 * this project's own media, AVIF is 1.0-1.3x the size of WebP at 48px and only
 * pulls ahead from roughly 128px, where it reaches 0.6x and then 0.24-0.33x at
 * banner sizes. Choosing by size keeps every asset on whichever encoder is
 * actually smaller for it.
 */
export const ASSET_IMAGE_AVIF_MIN_LONG_SIDE = 128;

/**
 * Picks the output format for an image transform.
 *
 * An explicit request always wins; otherwise the longest requested side
 * decides. An unbounded transform is treated as large, because the source is
 * kept at its own size and those are the cases AVIF was adopted for.
 */
export function resolveAssetImageFormat(
  dimensions: AssetUploadDimensions,
  requested?: AssetImageFormat,
): AssetImageFormat {
  if (requested) return normalizeAssetImageFormat(requested);
  const longSide = Math.max(dimensions.width ?? 0, dimensions.height ?? 0);
  if (!longSide) return DEFAULT_ASSET_IMAGE_FORMAT;
  return longSide < ASSET_IMAGE_AVIF_MIN_LONG_SIDE
    ? 'webp'
    : DEFAULT_ASSET_IMAGE_FORMAT;
}

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
  type: 'original';
}

export interface AssetImageTransformSettings extends AssetResizeSettings {
  type: 'image-transform';
  quality: number;
  format: AssetImageFormat;
}

export interface AssetVideoTransformSettings extends AssetResizeSettings {
  type: 'video-transform';
  quality: number;
  stripAudio: boolean;
  fastConversion: boolean;
}

export interface AssetFileZipSettings {
  type: 'file-zip';
}

export type AssetTransformSettings =
  AssetImageTransformSettings | AssetVideoTransformSettings;

export type AssetUploadSettings =
  AssetOriginalSettings | AssetTransformSettings | AssetFileZipSettings;

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

export function normalizeAssetImageFormat(
  format: AssetImageFormat | undefined,
): AssetImageFormat {
  return format === 'webp' ? 'webp' : DEFAULT_ASSET_IMAGE_FORMAT;
}

export function normalizeAssetResizeMode(
  resizeMode: AssetResizeMode | undefined,
): AssetResizeMode {
  return resizeMode === 'cover' ? 'cover' : 'inside';
}

export function createOriginalAssetSettings(): AssetOriginalSettings {
  return {
    type: 'original',
  };
}

export function createImageTransformSettings(
  quality: number,
  dimensions: AssetUploadDimensions,
  options: {
    resizeMode?: AssetResizeMode;
    allowUpscale?: boolean;
    format?: AssetImageFormat;
  } = {},
): AssetImageTransformSettings {
  return {
    type: 'image-transform',
    quality: normalizeAssetUploadQuality(quality),
    dimensions: normalizeAssetUploadDimensions(dimensions),
    resizeMode: normalizeAssetResizeMode(options.resizeMode),
    allowUpscale: Boolean(options.allowUpscale),
    format: resolveAssetImageFormat(
      normalizeAssetUploadDimensions(dimensions),
      options.format,
    ),
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
    type: 'file-zip',
  };
}

/**
 * Stable description of the parameters that produced a stored file.
 *
 * It carries only what the caller asked for. Anything describing the engine's
 * own generation — an encoder version, a settings schema version — belongs in
 * `contentHash`, which already changes whenever the output bytes change. A
 * generation counter here would split byte-identical outputs into duplicate
 * rows that nothing ever reconciles.
 */
export function buildAssetSettingsKey(settings: AssetUploadSettings): string {
  if (settings.type === 'original') {
    return 'original';
  }

  if (settings.type === 'file-zip') {
    return 'file-zip';
  }

  const width = settings.dimensions.width ?? 0;
  const height = settings.dimensions.height ?? 0;
  const baseParts = [
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

  return [...baseParts, `fmt:${settings.format}`].join(':');
}
