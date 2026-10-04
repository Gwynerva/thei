import { coverDateRanges, type DateRange } from './date-range';
import type { LifeTransition } from './life';
import { lifeGapDuration, type LifeGapDuration } from './life-timeline';

/** How a period is drawn: a dot for a day, a triangle at a start or an end. */
export type PublicPeriodMark = 'day' | 'start' | 'end';

/** The mark of a point on the life timeline, for a period's start or end. */
export function lifeTransitionMark(
  transition: LifeTransition,
): PublicPeriodMark | undefined {
  switch (transition) {
    case 'started':
      return 'start';
    case 'ended':
      return 'end';
    case 'occurred':
      return 'day';
    default:
      return undefined;
  }
}

const EMPTY_DURATION: LifeGapDuration = { years: 0, months: 0, days: 0 };

export function sortPublicTimelineItemsNewestFirst<T>(
  items: readonly T[],
  rangeOf: (item: T) => DateRange,
): T[] {
  return items
    .map((item, index) => ({ item, index, range: rangeOf(item) }))
    .sort(
      (left, right) =>
        right.range.endDate.localeCompare(left.range.endDate) ||
        right.range.startDate.localeCompare(left.range.startDate) ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

export function publicTimelineGapDuration(
  newer: DateRange,
  older: DateRange,
): LifeGapDuration {
  if (newer.startDate <= older.endDate) return { ...EMPTY_DURATION };
  return lifeGapDuration(newer.startDate, older.endDate);
}

/**
 * The pause before the period at `index` of a newest-first list: from its end
 * to the start of everything newer. Periods may overlap or hold one another,
 * so the neighbour above is not enough — a long period can cover a gap
 * between two shorter ones it contains.
 */
export function publicTimelineGapBefore(
  ordered: readonly DateRange[],
  index: number,
): LifeGapDuration {
  const older = ordered[index];
  if (!older || index < 1) return { ...EMPTY_DURATION };
  return publicTimelineGapDuration(
    coverDateRanges(ordered.slice(0, index)),
    older,
  );
}

export function publicTimelinePeriodDuration(
  period: DateRange,
): LifeGapDuration {
  return lifeGapDuration(nextUtcDate(period.endDate), period.startDate);
}

export function publicTimelineHasGap(duration: LifeGapDuration) {
  return duration.years + duration.months + duration.days > 0;
}

export function publicTimelineIsDay(period: DateRange) {
  return period.startDate === period.endDate;
}

function nextUtcDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
