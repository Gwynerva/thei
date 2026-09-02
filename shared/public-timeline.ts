import type { DateRange } from './date-range';
import { lifeGapDuration, type LifeGapDuration } from './life-timeline';

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
