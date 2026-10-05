import type { AutoImageFormat } from '#layers/thei/shared/asset-image-format-auto';
import {
  ASSET_QUALITY_STOPS,
  assetQualityLevelAt,
  type AssetQualityStop,
} from '#layers/thei/shared/asset-quality-levels';
import type {
  AssetImageFormat,
  AssetUploadSettings,
} from '#layers/thei/shared/asset-upload-settings';

export function qualityStopLabel(stop: AssetQualityStop): string {
  return phrase.value[`asset_quality_${stop}`];
}

export function qualityStopLabels(): Record<AssetQualityStop, string> {
  return Object.fromEntries(
    ASSET_QUALITY_STOPS.map((stop) => [stop, qualityStopLabel(stop)]),
  ) as Record<AssetQualityStop, string>;
}

/**
 * What sets a stored variant apart besides its format and size, in a word
 * or two: "Unprocessed", "Medium quality", "Lossless", "Low quality · mono".
 * How it was cut and turned is the recipe's, shown on hover; a vector has
 * nothing to add.
 */
export function variantDetail(
  settings: AssetUploadSettings | null | undefined,
): string | undefined {
  if (!settings) return undefined;
  if (settings.type === 'original')
    return phrase.value.upload_variant_unchanged;
  if (settings.type === 'file-zip') return phrase.value.asset_recipe_zip;
  if (settings.type === 'image-transform' && settings.format === 'svg') {
    return undefined;
  }
  if (
    settings.type === 'image-transform' &&
    settings.format === 'webp-lossless'
  ) {
    return phrase.value.asset_quality_lossless;
  }
  // A file made by an older version at another number is "Quality 85".
  const level = assetQualityLevelAt(settings.quality);
  const quality = level
    ? phrase.value.asset_recipe_quality_level(qualityStopLabel(level))
    : phrase.value.asset_recipe_quality(settings.quality);
  const text =
    settings.type === 'audio-transform' && settings.mono
      ? `${quality} · ${phrase.value.asset_recipe_mono}`
      : quality;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function imageFormatLabel(format: AssetImageFormat): string {
  return {
    avif: 'AVIF',
    webp: 'WebP',
    'webp-lossless': phrase.value.upload_format_lossless,
    svg: 'SVG',
  }[format];
}

export interface SizeShare {
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

/**
 * A result's size as a share of its source's: "38%". Within a percent either
 * way it is the same size and says so neutrally.
 */
export function sizeShare(
  size: number | undefined,
  sourceSize: number | undefined,
): SizeShare | undefined {
  if (!size || !sourceSize) return undefined;
  const percent = (size / sourceSize) * 100;
  return {
    text: `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`,
    tone:
      Math.abs(percent - 100) < 1 ? 'neutral' : percent < 100 ? 'good' : 'bad',
  };
}

export const SIZE_SHARE_CLASS: Record<SizeShare['tone'], string> = {
  good: 'text-accent',
  bad: 'text-text-error',
  neutral: 'text-text-3',
};

/**
 * What "Auto" picked, and why when that is not plain: "AVIF: the smallest",
 * but a vector staying SVG needs no reason.
 */
export function autoImageFormatDetail(
  auto: AutoImageFormat,
): string | undefined {
  if (auto.reason === 'vector') return imageFormatLabel(auto.format);
  if (!auto.reason) return undefined;
  return phrase.value.upload_format_picked(
    imageFormatLabel(auto.format),
    phrase.value.upload_format_reason_smallest,
  );
}
