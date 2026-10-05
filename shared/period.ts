import {
  dateRangeEndTime,
  dateRangeStartTime,
  isDateRangeValue,
} from './date-range';
import {
  mergeDatePrecision,
  normalizeDatePrecisionInfo,
  type DatedPeriod,
} from './date-precision';
import { normalizeHeadingText } from './terminal-punctuation';

export const PERIOD_OWNER_TYPES = ['event', 'project-section'] as const;

export type PeriodOwnerType = (typeof PERIOD_OWNER_TYPES)[number];

/**
 * One period of an event or a project section: its dates, how sure they are,
 * and what that stretch was — "Studies", "Italy" — when the owner named it.
 * A label is optional; an empty one says nothing, and the dates speak alone.
 */
export type Period = DatedPeriod & { label: string };

export const PERIOD_LABEL_MAX_LENGTH = 100;

export class PeriodError extends Error {}

/** A label names a stretch, as a heading does, and ends as one. */
export function normalizePeriodLabel(value: unknown): string {
  return typeof value === 'string' ? normalizeHeadingText(value.trim()) : '';
}

/**
 * The periods of an event or a section, sorted and with overlaps folded.
 *
 * Overlapping periods are one stretch only when they are named alike: two
 * unnamed ones, or two with the same label. Differently named ones say
 * different things — "Italy" ending the day "France" begins — and both stay.
 *
 * A period without a `label` reads as unnamed. That is also what a panel of
 * the previous release, still open in a browser, sends.
 */
export function normalizePeriods(value: unknown): Period[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new PeriodError('Period is required');
  const sorted = value
    .map((period): Period => {
      if (!period || typeof period !== 'object')
        throw new PeriodError('Invalid period');
      const source = period as Record<string, unknown>;
      if (
        !isDateRangeValue(source.startDate) ||
        !isDateRangeValue(source.endDate) ||
        dateRangeStartTime(source.startDate) > dateRangeEndTime(source.endDate)
      )
        throw new PeriodError('Invalid period');
      const label = normalizePeriodLabel(source.label);
      if (Array.from(label).length > PERIOD_LABEL_MAX_LENGTH)
        throw new PeriodError('Period label is too long');
      return {
        startDate: source.startDate,
        endDate: source.endDate,
        ...normalizeDatePrecisionInfo({
          precision: source.precision as never,
          precisionNote: source.precisionNote as never,
        }),
        label,
      };
    })
    .sort(comparePeriods);
  const merged: Period[] = [];
  const lastByLabel = new Map<string, Period>();
  for (const period of sorted) {
    const previous = lastByLabel.get(period.label);
    if (previous && period.startDate <= previous.endDate) {
      if (period.endDate > previous.endDate) previous.endDate = period.endDate;
      Object.assign(previous, mergeDatePrecision(previous, period));
    } else {
      const copy = { ...period };
      merged.push(copy);
      lastByLabel.set(period.label, copy);
    }
  }
  // A period that grew may now end after one named otherwise.
  return merged.sort(comparePeriods);
}

/**
 * Earliest first, then the shorter one, then by label. The label is compared
 * by code unit rather than by locale, so the browser and the server put two
 * periods with the same dates in the same order.
 */
export function comparePeriods(left: Period, right: Period) {
  return (
    dateRangeStartTime(left.startDate) - dateRangeStartTime(right.startDate) ||
    dateRangeEndTime(left.endDate) - dateRangeEndTime(right.endDate) ||
    (left.label < right.label ? -1 : left.label > right.label ? 1 : 0)
  );
}
