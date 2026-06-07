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
