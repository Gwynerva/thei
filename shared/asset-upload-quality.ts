import {
  assetQualityLevelOf,
  AVIF_QUALITY_BY_LEVEL,
  interpolateByQualityLevel,
  VIDEO_AUDIO_BITRATE_BY_LEVEL,
  VIDEO_BITRATE_FACTOR_BY_LEVEL,
} from './asset-quality-levels';
import type { FileDimensions } from './asset-upload-dimensions';
import { normalizeAssetUploadQuality } from './asset-upload-settings';

/**
 * Maps the stored 10-100 image quality onto AVIF's own scale.
 *
 * The level table is the truth; a number between two levels — a recipe from
 * an older version, say — lands on the line between them.
 */
export function imageDisplayQualityToAvifQuality(quality: number): number {
  return Math.round(
    interpolateByQualityLevel(
      AVIF_QUALITY_BY_LEVEL,
      normalizeAssetUploadQuality(quality),
    ),
  );
}

/**
 * The bitrate ladder a video is encoded to.
 *
 * A file's size is only predictable when the encoder is told the bitrate to
 * hit — which is how Premiere, Telegram and Steam can show a size before
 * encoding — so the target is chosen here and the estimate multiplies it by
 * the duration.
 *
 * The base is 3.5 Mbit/s at 1080p30 for the medium level, between what
 * YouTube streams and what a camera records. It scales a little less than
 * linearly with the pixels (bigger frames need fewer bits per pixel) and with
 * the frame rate (later frames repeat much of the earlier ones). The source's
 * own bitrate, rescaled to the output pixels, caps it: a re-encode cannot add
 * detail the source never had, whatever level is asked for.
 */
export const VIDEO_BASE_BITRATE = 3_500_000;
const VIDEO_BASE_PIXELS = 1920 * 1080;
const VIDEO_BASE_FPS = 30;
const VIDEO_PIXEL_EXPONENT = 0.85;
const VIDEO_FPS_EXPONENT = 0.6;
export const VIDEO_MIN_BITRATE = 100_000;
export const VIDEO_MAX_BITRATE = 60_000_000;

export interface VideoBitrateSource extends FileDimensions {
  fps?: number;
  /** Bits per second of the source's video stream, when known. */
  bitrate?: number;
}

export function videoTargetBitrate(
  quality: number,
  output: FileDimensions,
  source: VideoBitrateSource,
): number {
  const pixels = output.width * output.height;
  const fps = Math.min(120, Math.max(12, source.fps ?? VIDEO_BASE_FPS));
  const factor = interpolateByQualityLevel(
    VIDEO_BITRATE_FACTOR_BY_LEVEL,
    normalizeAssetUploadQuality(quality),
  );
  let target =
    VIDEO_BASE_BITRATE *
    (pixels / VIDEO_BASE_PIXELS) ** VIDEO_PIXEL_EXPONENT *
    (fps / VIDEO_BASE_FPS) ** VIDEO_FPS_EXPONENT *
    factor;
  const sourcePixels = source.width * source.height;
  if (source.bitrate && sourcePixels > 0) {
    target = Math.min(
      target,
      source.bitrate * (pixels / sourcePixels) ** VIDEO_PIXEL_EXPONENT,
    );
  }
  const bounded = Math.min(
    VIDEO_MAX_BITRATE,
    Math.max(VIDEO_MIN_BITRATE, target),
  );
  return Math.round(bounded / 1000) * 1000;
}

/** Opus bitrate of the sound, in bits per second, at a stored quality. */
export function videoAudioBitrate(quality: number): number {
  return VIDEO_AUDIO_BITRATE_BY_LEVEL[
    assetQualityLevelOf(normalizeAssetUploadQuality(quality))
  ];
}
