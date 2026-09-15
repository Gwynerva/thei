import { normalizeAssetUploadQuality } from './asset-upload-settings';

const VIDEO_EFFECTIVE_QUALITY_MIN = 10;
const VIDEO_EFFECTIVE_QUALITY_MAX = 55;

export function videoDisplayQualityToEffectiveQuality(quality: number): number {
  const normalized = normalizeAssetUploadQuality(quality);
  return Math.round(
    VIDEO_EFFECTIVE_QUALITY_MIN +
      ((normalized - 10) / 90) *
        (VIDEO_EFFECTIVE_QUALITY_MAX - VIDEO_EFFECTIVE_QUALITY_MIN),
  );
}

export function videoQualityToVp9Crf(displayQuality: number): number {
  const effective = videoDisplayQualityToEffectiveQuality(displayQuality);
  return Math.round(45 - ((effective - 10) / 90) * 30);
}

/**
 * Maps the displayed 10-100 image quality onto AVIF's own scale.
 *
 * AVIF and WebP do not share a quality scale: AVIF 90 is near-lossless and
 * produces files larger than the WebP 90 it replaced, at a large encoding
 * cost. Roughly, AVIF 50 matches WebP 75, so the displayed range is compressed
 * into 25-70 and the perceptual result stays close to what the WebP defaults
 * produced while the files get meaningfully smaller.
 */
const AVIF_QUALITY_MIN = 25;
const AVIF_QUALITY_MAX = 70;

export function imageDisplayQualityToAvifQuality(quality: number): number {
  const normalized = normalizeAssetUploadQuality(quality);
  return Math.round(
    AVIF_QUALITY_MIN +
      ((normalized - 10) / 90) * (AVIF_QUALITY_MAX - AVIF_QUALITY_MIN),
  );
}
