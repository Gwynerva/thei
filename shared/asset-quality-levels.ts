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

/** The stored quality each level stands for. WebP takes it as it is. */
export const ASSET_QUALITY_LEVEL_QUALITY: Record<AssetQualityLevel, number> = {
  minimal: 40,
  low: 60,
  medium: 75,
  high: 90,
  maximum: 95,
};

export const DEFAULT_IMAGE_QUALITY_LEVEL: AssetQualityLevel = 'high';
/**
 * Video starts a step lower: the bitrate ladder spends what a good camera
 * would, and at medium a minute of 1080p30 is already about 26 MB.
 */
export const DEFAULT_VIDEO_QUALITY_LEVEL: AssetQualityLevel = 'medium';

export function isAssetQualityLevel(
  value: unknown,
): value is AssetQualityLevel {
  return (
    typeof value === 'string' &&
    (ASSET_QUALITY_LEVELS as readonly string[]).includes(value)
  );
}

export function isAssetQualityStop(value: unknown): value is AssetQualityStop {
  return value === 'lossless' || isAssetQualityLevel(value);
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
 * than WebP 90 at a large encoding cost, while AVIF 55 looks like WebP 75.
 */
export const AVIF_QUALITY_BY_LEVEL: Record<AssetQualityLevel, number> = {
  minimal: 30,
  low: 45,
  medium: 55,
  high: 65,
  maximum: 72,
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

/** Opus bitrate of a video's sound at each level, in bits per second. */
export const VIDEO_AUDIO_BITRATE_BY_LEVEL: Record<AssetQualityLevel, number> = {
  minimal: 64_000,
  low: 96_000,
  medium: 128_000,
  high: 128_000,
  maximum: 128_000,
};
