import {
  compactSize,
  type DiscreteBarStop,
} from '#layers/thei/app/components/field/discrete-bar-stops';
import {
  ASSET_QUALITY_LEVELS,
  ASSET_QUALITY_STOPS,
  type AssetQualityLevel,
  type AssetQualityStop,
} from '#layers/thei/shared/asset-quality-levels';
import type { AssetImageFormat } from '#layers/thei/shared/asset-upload-settings';
import type { LanguageSizeUnits } from '#layers/thei/shared/language/types';
import { sizeShare } from './format-labels';

/** The formats "Auto" weighs at a lossy stop; lossless is a stop of its own. */
export const LOSSY_IMAGE_FORMATS: readonly AssetImageFormat[] = [
  'avif',
  'webp',
];

/** A dry run worth asking for: a lossy level in a format. */
export interface StopRender {
  level: AssetQualityLevel;
  format: AssetImageFormat;
}

/**
 * The dry runs the bar needs beyond the chosen stop, nearest first.
 *
 * The chosen stop is rendered in every format already, so the format list has
 * its sizes; the other stops need only the format that would be stored at
 * them — both lossy ones under "Auto", which picks by size. Lossless is one
 * render whatever the level, and is among the chosen stop's formats.
 */
export function stopRenderOrder(
  current: AssetQualityStop,
  chosen: 'auto' | AssetImageFormat,
): StopRender[] {
  const formats: AssetImageFormat[] =
    chosen === 'auto'
      ? [...LOSSY_IMAGE_FORMATS]
      : LOSSY_IMAGE_FORMATS.includes(chosen)
        ? [chosen]
        : [];
  if (!formats.length) return [];
  const at = ASSET_QUALITY_STOPS.indexOf(current);
  return ASSET_QUALITY_LEVELS.filter((level) => level !== current)
    .map((level) => ({
      level,
      distance: Math.abs(ASSET_QUALITY_LEVELS.indexOf(level) - at),
    }))
    .sort((left, right) => left.distance - right.distance)
    .flatMap(({ level }) => formats.map((format) => ({ level, format })));
}

export interface StopSize {
  bytes: number;
  approximate: boolean;
}

export interface QualityStopsInput {
  /** Whether the lossless stop is offered past the levels. */
  allowLossless: boolean;
  labels: Record<AssetQualityStop, string>;
  /** What a stop comes out at, exact or guessed; nothing while unknown. */
  sizeOf: (stop: AssetQualityStop) => StopSize | undefined;
  /** A size is on its way for this stop. */
  pendingOf?: (stop: AssetQualityStop) => boolean;
  /** Size of the source, for each stop's share of it in the popup. */
  sourceSize?: number;
  units: LanguageSizeUnits;
  /** The exact size in words, for a stop's popup. */
  humanSize: (bytes: number) => string;
}

/**
 * The bar's stops, each captioned with the size it comes out at.
 *
 * Sizes are compacted so six of them fit under six stops; the exact size and
 * the share of the source stay in the popup. A guessed size is marked
 * approximate, and a stop whose size is still coming shows that instead.
 */
export function buildQualityStops(input: QualityStopsInput): DiscreteBarStop[] {
  const values = input.allowLossless
    ? [...ASSET_QUALITY_STOPS]
    : [...ASSET_QUALITY_LEVELS];
  return values.map((stop) => {
    const size = input.sizeOf(stop);
    const share = size ? sizeShare(size.bytes, input.sourceSize) : undefined;
    return {
      value: stop,
      label: input.labels[stop],
      ...(size ? { caption: compactSize(size.bytes, input.units) } : {}),
      ...(size?.approximate ? { approximate: true } : {}),
      ...(!size && input.pendingOf?.(stop) ? { pending: true } : {}),
      ...(size
        ? {
            title: [
              input.labels[stop],
              `${size.approximate ? '≈ ' : ''}${input.humanSize(size.bytes)}`,
              share?.text,
            ]
              .filter(Boolean)
              .join(' · '),
          }
        : {}),
    };
  });
}
