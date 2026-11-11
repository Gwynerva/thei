/**
 * Named quality levels: the stops a variant is made at.
 *
 * A level is a preset, not a stored value. The recipe keeps the number a
 * level stands for, so a file made at any number — by an older version, or by
 * a place's own default — is still described exactly, and a stored key never
 * has to change. Five lossy steps are what most media tools settle on
 * (Photoshop, Apple Photos, DaVinci, Steam); each is roughly 1.6–1.8× the
 * size of the one below, the spacing of about five CRF steps. Lossless is a
 * sixth stop for images only: a format rather than a quality.
 */
export const ASSET_QUALITY_LEVELS = [
  'minimal',
  'low',
  'medium',
  'high',
  'maximum',
] as const;

export type AssetQualityLevel = (typeof ASSET_QUALITY_LEVELS)[number];

/** A level, or the lossless stop past the last one. */
export type AssetQualityStop = AssetQualityLevel | 'lossless';

export const ASSET_QUALITY_STOPS: readonly AssetQualityStop[] = [
  ...ASSET_QUALITY_LEVELS,
  'lossless',
];

/**
 * The stored quality each level stands for: the name of a level in a recipe,
 * not what an encoder is asked for. Each encoder has a table of its own.
 */
export const ASSET_QUALITY_LEVEL_QUALITY: Record<AssetQualityLevel, number> = {
  minimal: 40,
  low: 60,
  medium: 75,
  high: 90,
  maximum: 95,
};

/**
 * Both kinds start at medium. A photo at high is about 1.7× the size of the
 * same one at medium for a difference few screens show, and the video
 * bitrate ladder already spends what a good camera would: at medium a minute
 * of 1080p30 is about 26 MB. A place with a profile of its own may start
 * higher (`asset-upload-profiles.ts`).
 */
export const DEFAULT_IMAGE_QUALITY_LEVEL: AssetQualityLevel = 'medium';
export const DEFAULT_VIDEO_QUALITY_LEVEL: AssetQualityLevel = 'medium';
/**
 * Medium is 96 kbit/s of stereo Opus — near transparent for music, where Xiph
 * puts storing it at 96–128 — and 48 of mono, more than a voice needs.
 */
export const DEFAULT_AUDIO_QUALITY_LEVEL: AssetQualityLevel = 'medium';

export function isAssetQualityLevel(
  value: unknown,
): value is AssetQualityLevel {
  return (
    typeof value === 'string' &&
    (ASSET_QUALITY_LEVELS as readonly string[]).includes(value)
  );
}

/** The level nearest to a stored quality; halfway between two, the higher. */
export function assetQualityLevelOf(quality: number): AssetQualityLevel {
  let nearest: AssetQualityLevel = ASSET_QUALITY_LEVELS[0];
  let distance = Infinity;
  for (const level of ASSET_QUALITY_LEVELS) {
    const own = Math.abs(ASSET_QUALITY_LEVEL_QUALITY[level] - quality);
    if (own <= distance) {
      nearest = level;
      distance = own;
    }
  }
  return nearest;
}

/** The level a stored quality is exactly, if it is one. */
export function assetQualityLevelAt(
  quality: number,
): AssetQualityLevel | undefined {
  return ASSET_QUALITY_LEVELS.find(
    (level) => ASSET_QUALITY_LEVEL_QUALITY[level] === quality,
  );
}

/**
 * Reads a per-level table at any stored quality: a level's own value at its
 * number, a straight line between two, and the end values past them.
 */
export function interpolateByQualityLevel(
  table: Record<AssetQualityLevel, number>,
  quality: number,
): number {
  const points = ASSET_QUALITY_LEVELS.map((level) => ({
    at: ASSET_QUALITY_LEVEL_QUALITY[level],
    value: table[level],
  }));
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (quality <= first.at) return first.value;
  if (quality >= last.at) return last.value;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!;
    const to = points[index]!;
    if (quality <= to.at) {
      const share = (quality - from.at) / (to.at - from.at);
      return from.value + (to.value - from.value) * share;
    }
  }
  return last.value;
}

/**
 * AVIF's own quality at each level.
 *
 * AVIF and WebP do not share a scale: AVIF 90 is near-lossless and larger
 * than WebP 90 at a large encoding cost, while AVIF 55 looks like WebP 80.
 * Encoded at `effort: 3` since 0.0.8: on real photographs the files weigh
 * what they did at effort 4 (97–108 %) and the SSIM against the source is
 * lower by 0.0005–0.003, a fraction of the step between two levels, for a
 * quarter of the time (the media bench, docs/media-quality.md). A synthetic
 * picture had suggested lower qualities; real ones did not bear that out.
 */
export const AVIF_QUALITY_BY_LEVEL: Record<AssetQualityLevel, number> = {
  minimal: 30,
  low: 45,
  medium: 55,
  high: 65,
  maximum: 72,
};

/**
 * WebP's own quality at each level: the one that stays as close to the
 * source as AVIF does there, so a level is one quality whatever the format,
 * and "Auto", which takes the smaller file, compares like with like.
 *
 * The stored number will not do as it is: libwebp's scale has a knee at 75,
 * three times steeper above it than below, so 40, 60 and 75 are nearly one
 * quality, rougher than AVIF's medium, and 90 and 95 twice AVIF's size. The
 * numbers here are where four measures agree (SSIM and PSNR of the
 * brightness, XPSNR, VMAF) on the photographs and game screenshots of the
 * image quality bench (docs/media-quality.md); a drawing needs more than
 * WebP has to match AVIF, and is better stored lossless anyway.
 *
 * Since 0.0.9: before it libwebp was asked for the stored number as it was,
 * so a WebP file made by 0.0.8 or earlier under the same recipe (`q90`) was
 * encoded at libwebp 90, not 86. Its bytes, and so its `contentHash`, differ
 * from what the recipe makes now; the row describes itself, and nothing is
 * re-encoded.
 */
export const WEBP_QUALITY_BY_LEVEL: Record<AssetQualityLevel, number> = {
  minimal: 35,
  low: 62,
  medium: 80,
  high: 86,
  maximum: 89,
};

/** Video bitrate at each level, relative to medium. */
export const VIDEO_BITRATE_FACTOR_BY_LEVEL: Record<AssetQualityLevel, number> =
  {
    minimal: 0.3,
    low: 0.55,
    medium: 1,
    high: 1.7,
    maximum: 2.8,
  };

/**
 * Opus bitrate of a recording at each level, in bits per second: stereo, and
 * mono at about half, since one channel carries half the information.
 */
export const AUDIO_BITRATE_BY_LEVEL: Record<AssetQualityLevel, number> = {
  minimal: 48_000,
  low: 64_000,
  medium: 96_000,
  high: 128_000,
  maximum: 160_000,
};

export const AUDIO_MONO_BITRATE_BY_LEVEL: Record<AssetQualityLevel, number> = {
  minimal: 24_000,
  low: 32_000,
  medium: 48_000,
  high: 64_000,
  maximum: 80_000,
};

/** Opus bitrate of a video's sound at each level, in bits per second. */
export const VIDEO_AUDIO_BITRATE_BY_LEVEL: Record<AssetQualityLevel, number> = {
  minimal: 64_000,
  low: 96_000,
  medium: 128_000,
  high: 128_000,
  maximum: 128_000,
};
