import { coverDateRanges, type DateRange } from './date-range';

/**
 * How sure a stored date is.
 *
 * A date in Thei is always written down in full, because a timeline needs
 * somewhere to put it. The precision says how much of that date the owner
 * actually stands behind: `exact` all of it, `day` everything but the day,
 * `month` only the year, `year` not even that.
 */
export const DATE_PRECISIONS = ['exact', 'day', 'month', 'year'] as const;

export type DatePrecision = (typeof DATE_PRECISIONS)[number];

export function isDatePrecision(value: unknown): value is DatePrecision {
  return (
    typeof value === 'string' &&
    (DATE_PRECISIONS as readonly string[]).includes(value)
  );
}

export function toDatePrecision(value: unknown): DatePrecision {
  return isDatePrecision(value) ? value : 'exact';
}

/** Where a precision stands among the others: wider doubt is a higher step. */
export function datePrecisionStep(precision: DatePrecision): number {
  return DATE_PRECISIONS.indexOf(precision);
}

/**
 * How loudly the doubt is shown: an exact date says nothing, a doubtful day is
 * a remark, a doubtful year is a warning.
 */
export type DatePrecisionTone = 'neutral' | 'warning' | 'alert';

export function datePrecisionTone(precision: DatePrecision): DatePrecisionTone {
  switch (precision) {
    case 'exact':
      return 'neutral';
    case 'day':
      return 'neutral';
    case 'month':
      return 'warning';
    case 'year':
      return 'alert';
  }
}

export function isApproximateDate(precision: DatePrecision): boolean {
  return precision !== 'exact';
}

/**
 * What is worth printing of a date at this precision: the whole date, the
 * month and the year, or the year alone.
 */
export type DatePrecisionUnit = 'day' | 'month' | 'year';

export function datePrecisionUnit(precision: DatePrecision): DatePrecisionUnit {
  switch (precision) {
    case 'exact':
    case 'day':
      return 'day';
    case 'month':
      return 'month';
    case 'year':
      return 'year';
  }
}

/** A precision carried alongside a date or a period. */
export interface DatePrecisionInfo {
  precision: DatePrecision;
  /** The owner's explanation; empty when they did not give one. */
  precisionNote: string;
}

export const EXACT_DATE_PRECISION: DatePrecisionInfo = {
  precision: 'exact',
  precisionNote: '',
};

export function normalizeDatePrecisionInfo(
  value: Partial<DatePrecisionInfo> | undefined | null,
): DatePrecisionInfo {
  const precision = toDatePrecision(value?.precision);
  const note =
    typeof value?.precisionNote === 'string' ? value.precisionNote.trim() : '';
  return {
    precision,
    // A note without doubt has nothing to explain, so it never survives.
    precisionNote: precision === 'exact' ? '' : note,
  };
}

/** A dated period together with how sure its dates are. */
export type DatedPeriod = DateRange & DatePrecisionInfo;

/**
 * Merging two overlapping periods keeps the wider doubt: a certain stretch
 * swallowed by an uncertain one is no longer certain, and the first
 * explanation given is the one worth keeping.
 */
export function mergeDatePrecision(
  left: DatePrecisionInfo,
  right: DatePrecisionInfo,
): DatePrecisionInfo {
  const precision =
    datePrecisionStep(left.precision) >= datePrecisionStep(right.precision)
      ? left.precision
      : right.precision;
  const note = left.precisionNote || right.precisionNote;
  return { precision, precisionNote: precision === 'exact' ? '' : note };
}

/** The one period covering all of them, doubting whatever any of them doubts. */
export function coverDatedPeriods(
  periods: readonly DatedPeriod[],
): DatedPeriod {
  const cover = coverDateRanges(periods);
  const precision = periods.reduce<DatePrecisionInfo>(
    (carried, period) => mergeDatePrecision(carried, period),
    EXACT_DATE_PRECISION,
  );
  return { ...cover, ...precision };
}
