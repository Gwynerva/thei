import { coverDateRanges, type DateRange } from './date-range';
import type { DatePrecision } from './date-precision';
import type { LifeTransition } from './life';
import { lifeGapDuration, type LifeGapDuration } from './life-timeline';

/**
 * How a period is drawn: a dot for a day, a triangle at a start or an end,
 * the two together for a whole stretch, and a start still rising for a period
 * not ended yet.
 */
export type PublicPeriodMark = 'day' | 'start' | 'end' | 'span' | 'ongoing';

/**
 * The mark of a point on the life timeline: which moment of its period a card
 * stands for. A card folding a start and an end is the whole stretch unless
 * both fell on one day; a Rewind day inside a period is that period going on.
 * Anything that is not a period has none.
 */
export function lifePointMark(
  point: {
    transition: LifeTransition;
    period?: DateRange;
    ongoing?: boolean;
  },
  rewindMatch?: 'exact' | 'ongoing',
): PublicPeriodMark | undefined {
  if (rewindMatch === 'ongoing') return 'ongoing';
  switch (point.transition) {
    case 'started':
      return point.ongoing ? 'ongoing' : 'start';
    case 'ended':
      return 'end';
    case 'occurred':
      return point.period ? 'span' : 'day';
    default:
      return undefined;
  }
}

/**
 * Where a period stands against the day a page is read on (`cutoff`, the day
 * it already is somewhere on Earth): gone by, still running, or yet to come.
 */
export function publicPeriodState(
  period: DateRange,
  cutoff: string,
): 'past' | 'ongoing' | 'upcoming' {
  if (period.startDate > cutoff) return 'upcoming';
  return period.endDate > cutoff ? 'ongoing' : 'past';
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

/**
 * Whether a period is drawn as one moment rather than a stretch: a single
 * day, or a period the owner only knows to the month or the year that lies
 * within one of them — "2019" has no start and end worth drawing apart.
 */
export function publicTimelineIsDay(
  period: DateRange & { precision?: DatePrecision },
) {
  if (period.startDate === period.endDate) return true;
  const unit =
    period.precision === 'year' ? 4 : period.precision === 'month' ? 7 : 0;
  return (
    unit > 0 &&
    period.startDate.slice(0, unit) === period.endDate.slice(0, unit)
  );
}

function nextUtcDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
