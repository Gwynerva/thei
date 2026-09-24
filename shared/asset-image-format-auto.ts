import type { AssetImageFormat } from './asset-upload-settings';

export type AutoImageFormatReason = 'vector' | 'smallest';

export interface AutoImageFormat {
  format: AssetImageFormat;
  /** Absent while the sizes to choose by are still being measured. */
  reason?: AutoImageFormatReason;
}

/** The raster formats "Auto" weighs against each other. */
export const AUTO_IMAGE_FORMATS = ['avif', 'webp', 'webp-lossless'] as const;

/**
 * The format "Auto" picks for an output.
 *
 * A vector drawing stays a vector: cropped, never rasterised. Anything else
 * goes to whichever format came out smallest for these exact settings — the
 * editor encodes every one of them anyway, so the choice is made on real
 * sizes rather than on a guess about the picture. Lossless wins only when it
 * is also the smallest, which costs nothing. Until the sizes are in, AVIF
 * stands in: it was the smallest on nearly everything measured.
 */
export function recommendImageFormat(
  sizes: Partial<Record<AssetImageFormat, number>>,
  isVector = false,
): AutoImageFormat {
  if (isVector) return { format: 'svg', reason: 'vector' };
  const measured = AUTO_IMAGE_FORMATS.map((format) => ({
    format,
    size: sizes[format],
  }));
  if (measured.some((item) => item.size === undefined)) {
    return { format: 'avif' };
  }
  const smallest = measured.reduce((best, item) =>
    item.size! < best.size! ? item : best,
  );
  return { format: smallest.format, reason: 'smallest' };
}
