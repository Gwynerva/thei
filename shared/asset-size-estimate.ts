import {
  ASSET_QUALITY_LEVELS,
  type AssetQualityLevel,
  type AssetQualityStop,
} from './asset-quality-levels';
import { videoAudioBitrate, videoTargetBitrate } from './asset-upload-quality';
import type {
  AssetImageFormat,
  AssetVideoTransformSettings,
} from './asset-upload-settings';

export interface VideoSizeSource {
  width: number;
  height: number;
  /** Seconds. Without it there is nothing to multiply the bitrate by. */
  duration?: number;
  fps?: number;
  /** Bits per second of the source's video stream, when known. */
  bitrate?: number;
  /** `false` only when the source is known to be silent. */
  hasAudio?: boolean;
}

export interface VideoSizeEstimate {
  bytes: number;
  videoBitrate: number;
  audioBitrate: number;
}

/** WebM's share of the bytes — block headers and cues — plus a fixed head. */
const CONTAINER_SHARE = 0.01;
const CONTAINER_HEAD = 4096;
/**
 * Where two-pass libvpx lands against the rate it was given: a few percent
 * under, measured on this project's own clips (0.88–0.99 of the target,
 * most of them around 0.96).
 */
const ENCODER_LANDING = 0.96;

/**
 * What a video variant will weigh, before it is made.
 *
 * The encoder is asked for a bitrate, so the answer is that bitrate times the
 * duration, plus the sound and the container. Typical content lands within a
 * few percent either way; only content the encoder cannot spend the bits on —
 * a still frame held for a minute — comes out smaller.
 */
export function estimateVideoSize(
  settings: AssetVideoTransformSettings,
  source: VideoSizeSource,
): VideoSizeEstimate | undefined {
  if (!source.duration || !(source.duration > 0)) return undefined;
  const videoBitrate = videoTargetBitrate(
    settings.quality,
    settings.dimensions,
    source,
  );
  const withSound = source.hasAudio !== false && !settings.stripAudio;
  const audioBitrate = withSound ? videoAudioBitrate(settings.quality) : 0;
  const payload =
    ((videoBitrate * ENCODER_LANDING + audioBitrate) * source.duration) / 8;
  return {
    bytes: Math.round(payload * (1 + CONTAINER_SHARE) + CONTAINER_HEAD),
    videoBitrate,
    audioBitrate,
  };
}

type LossyImageFormat = 'avif' | 'webp';

/**
 * How a lossy image's size moves with the level, relative to medium.
 *
 * Medians over this project's own media — photographs, screenshots and flat
 * graphics — with the engine's encoder settings. A rule of thumb rather than
 * a law, so anything rendered for real replaces what it predicts.
 */
export const IMAGE_SIZE_RATIO_BY_LEVEL: Record<
  LossyImageFormat,
  Record<AssetQualityLevel, number>
> = {
  avif: { minimal: 0.42, low: 0.71, medium: 1, high: 1.3, maximum: 1.5 },
  webp: { minimal: 0.67, low: 0.85, medium: 1, high: 2.1, maximum: 3 },
};

/** Bits per output pixel at medium, when the source says nothing useful. */
const IMAGE_BITS_PER_PIXEL: Record<LossyImageFormat, number> = {
  avif: 0.3,
  webp: 0.35,
};
/** The share of a lossy source's bytes per pixel a medium re-encode keeps. */
const IMAGE_SOURCE_SHARE: Record<LossyImageFormat, number> = {
  avif: 0.25,
  webp: 0.3,
};
/** Bits per pixel of a lossless WebP of a photograph. */
const LOSSLESS_BITS_PER_PIXEL = 7;
/** What a lossless WebP weighs against the PNG it was made from. */
const LOSSLESS_FROM_PNG = 0.5;

export interface ImageSizeFallback {
  sourceBytes: number;
  sourcePixels: number;
  outputPixels: number;
  /** A PNG or GIF source: its size says nothing about a lossy output's. */
  sourceLossless: boolean;
}

export interface ImageSizeEstimate {
  bytes: number;
  approximate: boolean;
}

/**
 * What an image comes out at on a stop, in a format.
 *
 * Measured beats guessed: `measured` holds the sizes already rendered for
 * this geometry — each lossy level in this format, and the lossless stop. A
 * stop rendered for real is exact. One not rendered yet is scaled from the
 * nearest rendered level by the ratio table, and before anything is rendered
 * it is read off the source's bytes per pixel.
 */
export function estimateImageSize(
  format: AssetImageFormat,
  stop: AssetQualityStop,
  measured: Partial<Record<AssetQualityStop, number>>,
  fallback?: ImageSizeFallback,
): ImageSizeEstimate | undefined {
  const exact = measured[stop];
  if (exact !== undefined) return { bytes: exact, approximate: false };

  if (stop === 'lossless' || format === 'webp-lossless' || format === 'svg') {
    if (!fallback) return undefined;
    const bytes = fallback.sourceLossless
      ? fallback.sourceBytes *
        (fallback.outputPixels / Math.max(1, fallback.sourcePixels)) *
        LOSSLESS_FROM_PNG
      : (fallback.outputPixels * LOSSLESS_BITS_PER_PIXEL) / 8;
    return { bytes: Math.max(1, Math.round(bytes)), approximate: true };
  }

  const lossy: LossyImageFormat = format === 'avif' ? 'avif' : 'webp';
  const ratios = IMAGE_SIZE_RATIO_BY_LEVEL[lossy];
  const index = ASSET_QUALITY_LEVELS.indexOf(stop);
  let nearest: AssetQualityLevel | undefined;
  let distance = Infinity;
  for (const level of ASSET_QUALITY_LEVELS) {
    if (measured[level] === undefined) continue;
    const own = Math.abs(ASSET_QUALITY_LEVELS.indexOf(level) - index);
    if (own < distance) {
      nearest = level;
      distance = own;
    }
  }
  if (nearest !== undefined) {
    const scaled = (measured[nearest]! * ratios[stop]) / ratios[nearest];
    return { bytes: Math.max(1, Math.round(scaled)), approximate: true };
  }

  if (!fallback) return undefined;
  const bitsPerPixel =
    fallback.sourceLossless || fallback.sourcePixels <= 0
      ? IMAGE_BITS_PER_PIXEL[lossy]
      : ((fallback.sourceBytes * 8) / fallback.sourcePixels) *
        IMAGE_SOURCE_SHARE[lossy];
  const bytes = ((fallback.outputPixels * bitsPerPixel) / 8) * ratios[stop];
  return { bytes: Math.max(1, Math.round(bytes)), approximate: true };
}
