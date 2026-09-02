export type DateRange = {
  startDate: string;
  endDate: string;
};

export function coverDateRanges(periods: readonly DateRange[]): DateRange {
  if (!periods.length) throw new Error('At least one date range is required');
  return periods.reduce<DateRange>(
    (range, period) => ({
      startDate:
        period.startDate < range.startDate ? period.startDate : range.startDate,
      endDate: period.endDate > range.endDate ? period.endDate : range.endDate,
    }),
    { ...periods[0]! },
  );
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isDateRangeValue(value: unknown): value is string {
  return isDate(value);
}

export function dateRangeStartTime(value: string) {
  return Date.parse(`${value}T00:00:00`);
}

export function dateRangeEndTime(value: string) {
  return Date.parse(`${value}T23:59:59.999`);
}

export function toDateString(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function toPickerDate(value: string) {
  return new Date(`${value}T00:00`);
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  return Boolean(match && isValidDateParts(match));
}

function isValidDateParts(match: RegExpExecArray) {
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  );
}
