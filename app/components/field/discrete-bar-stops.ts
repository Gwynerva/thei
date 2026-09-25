import type { LanguageSizeUnits } from '#layers/thei/shared/language/types';

/** Colours the bar while a stop is chosen: how loudly it speaks. */
export type DiscreteBarTone = 'neutral' | 'warning' | 'alert';

export interface DiscreteBarStop {
  value: string;
  /** Named in the header while chosen, and read out by assistive technology. */
  label: string;
  /** Under the stop: a short figure, such as a size. */
  caption?: string;
  /** The caption is a guess, shown muted. */
  approximate?: boolean;
  /** A caption is on its way. */
  pending?: boolean;
  /** Full words for a popup, when the caption is too compact to be sure. */
  title?: string;
  tone?: DiscreteBarTone;
}

/**
 * Every stop owns an equal column of the row and sits at its centre, so the
 * captions under the track line up with the stops without measuring anything.
 * The track itself runs from the first centre to the last.
 */
export function stopPosition(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index + 0.5) / count) * 100;
}

/** The inset of the track from each end of the row, as a percentage. */
export function trackInset(count: number): number {
  return count > 0 ? 50 / count : 0;
}

/** A stop's place along the track, as a percentage of the track. */
export function trackPosition(index: number, count: number): number {
  return count > 1 ? (index / (count - 1)) * 100 : 0;
}

/** The stop nearest a pointer `x` pixels into a row `width` pixels wide. */
export function nearestStopIndex(
  x: number,
  width: number,
  count: number,
): number {
  if (count <= 0 || width <= 0) return 0;
  const column = Math.floor((x / width) * count);
  return Math.min(count - 1, Math.max(0, column));
}

/** Where a key moves the cursor from `index`; `undefined` for other keys. */
export function steppedIndex(
  index: number,
  key: string,
  count: number,
): number | undefined {
  const last = Math.max(0, count - 1);
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return Math.max(0, index - 1);
    case 'ArrowRight':
    case 'ArrowUp':
      return Math.min(last, index + 1);
    case 'PageDown':
      return Math.max(0, index - 2);
    case 'PageUp':
      return Math.min(last, index + 2);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return undefined;
  }
}

const UNIT_STEPS: { unit: keyof LanguageSizeUnits; scale: number }[] = [
  { unit: 'gb', scale: 1024 ** 3 },
  { unit: 'mb', scale: 1024 ** 2 },
  { unit: 'kb', scale: 1024 },
  { unit: 'b', scale: 1 },
];

/**
 * A size short enough for a caption under a stop: a whole number in its own
 * unit, rounded up so it never promises less than the file will weigh. "980
 * Kb" and "2 Mb" sit side by side and neither needs the other to be read.
 */
export function compactSize(bytes: number, units: LanguageSizeUnits): string {
  const step =
    UNIT_STEPS.find((candidate) => bytes >= candidate.scale) ??
    UNIT_STEPS[UNIT_STEPS.length - 1]!;
  return `${Math.ceil(bytes / step.scale)} ${units[step.unit]}`;
}
