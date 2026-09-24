import type { AssetMeta } from './asset';
import { rotatedDimensions } from './asset-crop';
import { assetQualityLevelAt } from './asset-quality-levels';
import type { FileDimensions } from './asset-upload-dimensions';
import type {
  AssetImageFormat,
  AssetUploadSettings,
} from './asset-upload-settings';
import type { LanguagePhrases } from './language/types';

type RecipePhrases = Pick<
  LanguagePhrases,
  | 'asset_recipe_original'
  | 'asset_recipe_zip'
  | 'asset_recipe_crop'
  | 'asset_recipe_crop_region'
  | 'asset_recipe_rotation'
  | 'asset_recipe_stretched'
  | 'asset_recipe_quality'
  | 'asset_recipe_quality_level'
  | 'asset_recipe_lossless'
  | 'asset_recipe_no_audio'
  | 'asset_recipe_fast'
  | 'asset_quality_minimal'
  | 'asset_quality_low'
  | 'asset_quality_medium'
  | 'asset_quality_high'
  | 'asset_quality_maximum'
>;

const FORMAT_LABELS: Record<AssetImageFormat, string> = {
  avif: 'AVIF',
  webp: 'WebP',
  'webp-lossless': 'WebP',
  svg: 'SVG',
};

/**
 * Says in one line how a stored file was made.
 *
 * It describes the bytes, not how any place shows them: "a 3200×1800 crop of
 * a 4000×3000 photo, written at 1200×675 as AVIF". A turn comes first, and
 * the source is then named as turned, the frame the crop was drawn on.
 */
export function describeAssetRecipe(
  settings: AssetUploadSettings | null | undefined,
  meta: AssetMeta | null | undefined,
  phrase: RecipePhrases,
): string | undefined {
  if (!settings) return undefined;
  if (settings.type === 'original') return phrase.asset_recipe_original;
  if (settings.type === 'file-zip') return phrase.asset_recipe_zip;

  const output = formatDimensions(settings.dimensions);
  const recorded =
    meta && 'sourceDimensions' in meta ? meta.sourceDimensions : undefined;
  const source = recorded
    ? rotatedDimensions(recorded, settings.rotation)
    : undefined;
  const region = settings.crop
    ? `${
        source
          ? phrase.asset_recipe_crop(
              formatDimensions(settings.crop),
              formatDimensions(source),
            )
          : phrase.asset_recipe_crop_region(formatDimensions(settings.crop))
      } → ${output}`
    : source && formatDimensions(source) !== output
      ? `${formatDimensions(source)} → ${output}`
      : output;
  const turned = settings.rotation
    ? `${phrase.asset_recipe_rotation(settings.rotation)} · ${region}`
    : region;
  const geometry = settings.stretch
    ? `${turned} · ${phrase.asset_recipe_stretched}`
    : turned;

  if (settings.type === 'image-transform') {
    const label = FORMAT_LABELS[settings.format] ?? settings.format;
    if (settings.format === 'svg') return [geometry, label].join(' · ');
    return [
      geometry,
      label,
      settings.format === 'webp-lossless'
        ? phrase.asset_recipe_lossless
        : describeQuality(settings.quality, phrase),
    ].join(' · ');
  }

  return [
    geometry,
    'WebM',
    describeQuality(settings.quality, phrase),
    ...(settings.stripAudio ? [phrase.asset_recipe_no_audio] : []),
    ...(settings.fastConversion ? [phrase.asset_recipe_fast] : []),
  ].join(' · ');
}

/**
 * A quality by the name of its level when it is one, and by its number when
 * it is not: a file made by an older version at 85 is still "quality 85".
 */
function describeQuality(quality: number, phrase: RecipePhrases): string {
  const level = assetQualityLevelAt(quality);
  return level
    ? phrase.asset_recipe_quality_level(phrase[`asset_quality_${level}`])
    : phrase.asset_recipe_quality(quality);
}

function formatDimensions(dimensions: Partial<FileDimensions>): string {
  return `${dimensions.width ?? '?'}×${dimensions.height ?? '?'}`;
}
