import type { AssetImageFormat } from './asset-upload-settings';

export type AutoImageFormatReason = 'vector' | 'photo' | 'smallest';

export interface AutoImageFormat {
  format: AssetImageFormat;
  /** Absent while the sizes to choose by are still being measured. */
  reason?: AutoImageFormatReason;
}

/** The lossy formats "Auto" weighs first; its choice is made once both are in. */
export const AUTO_LOSSY_IMAGE_FORMATS = ['avif', 'webp'] as const;

/** Every format "Auto" weighs, lossless WebP last: it takes the longest. */
export const AUTO_IMAGE_FORMATS = [
  ...AUTO_LOSSY_IMAGE_FORMATS,
  'webp-lossless',
] as const;

/**
 * The format "Auto" picks for an output.
 *
 * A vector drawing stays a vector: cropped, never rasterised. Anything else
 * goes to whichever format came out smallest for these exact settings, on
 * real sizes rather than on a guess about the picture. The two lossy ones
 * decide as soon as both are in; lossless takes longest to encode and joins
 * when it arrives, winning only when it is also the smallest, which costs
 * nothing. Until the lossy sizes are in, AVIF stands in: it was the smallest
 * on nearly everything measured.
 *
 * A photograph — the server tells one by what it is made of (`photographic`
 * of a draft) — is AVIF at once, with nothing weighed and nothing to wait
 * for: on real photographs lossless is never the smaller, and WebP hardly
 * ever, by a tenth at most (docs/media-quality.md). Another format is still
 * there to be chosen.
 */
export function recommendImageFormat(
  sizes: Partial<Record<AssetImageFormat, number>>,
  source: { isVector?: boolean; photographic?: boolean } = {},
): AutoImageFormat {
  if (source.isVector) return { format: 'svg', reason: 'vector' };
  if (source.photographic) return { format: 'avif', reason: 'photo' };
  if (AUTO_LOSSY_IMAGE_FORMATS.some((format) => sizes[format] === undefined)) {
    return { format: 'avif' };
  }
  const weighed: AssetImageFormat[] = [...AUTO_LOSSY_IMAGE_FORMATS];
  if (sizes['webp-lossless'] !== undefined) weighed.push('webp-lossless');
  const smallest = weighed.reduce((best, format) =>
    sizes[format]! < sizes[best]! ? format : best,
  );
  return { format: smallest, reason: 'smallest' };
}
