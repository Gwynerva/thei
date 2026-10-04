import type { DateRange } from './date-range';
import type { DatePrecision } from './date-precision';

/**
 * Dates as a public page spells them, in the site's language.
 *
 * Shared by the pages and the server: an Open Graph card says when something
 * happened in the same words the page it previews does.
 */
export function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "6 апреля 2027", "April 6, 2027"; the Russian year abbreviation goes. */
export function formatAbsolutePublicDate(
  date: string,
  locale: string,
  style: 'long' | 'short' = 'long',
): string {
  const parts = new Intl.DateTimeFormat(locale, {
    day: style === 'short' ? '2-digit' : 'numeric',
    month: style === 'short' ? '2-digit' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(toUtcDate(date));

  while (parts.at(-1)?.type === 'literal') parts.pop();
  return parts.map((part) => part.value).join('');
}

/**
 * Tidies a range Intl has written: an em dash, no year abbreviation. The
 * abbreviation is "г." after a year, never the end of "авг.".
 */
function tidyRange(text: string): string {
  return text
    .replaceAll(/(?<=\d)\s*г\./g, '')
    .replaceAll(' – ', ' — ')
    .trim();
}

/**
 * A period's days: "11–12 ноября 2026", or with `abbreviated` months, for a
 * place as narrow as a chip, "11–12 нояб. 2026".
 */
export function formatPublicDateRange(
  period: DateRange,
  locale: string,
  style: 'long' | 'short' | 'abbreviated' = 'long',
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: style === 'short' ? '2-digit' : 'numeric',
    month:
      style === 'short'
        ? '2-digit'
        : style === 'abbreviated'
          ? 'short'
          : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return tidyRange(
    formatter.formatRange(
      toUtcDate(period.startDate),
      toUtcDate(period.endDate),
    ),
  );
}

/**
 * A period as the owner knows it: to the year or the month when that is all
 * they are sure of, to the day otherwise — "2019", "март — июнь 2019",
 * "11–12 ноября 2026". A day the owner only knows the year of is not printed
 * as the first of January.
 */
export function formatPublicPeriodAtPrecision(
  period: DateRange & { precision?: DatePrecision },
  locale: string,
  style: 'long' | 'short' | 'abbreviated' = 'long',
): string {
  const precision = period.precision ?? 'exact';
  const start = toUtcDate(period.startDate);
  const end = toUtcDate(period.endDate);
  if (precision === 'year') {
    const [startYear, endYear] = [start.getUTCFullYear(), end.getUTCFullYear()];
    return startYear === endYear
      ? String(startYear)
      : `${startYear} — ${endYear}`;
  }
  if (precision === 'month') {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
    if (sameYear && !sameMonth && style !== 'short') {
      // Intl repeats the year on both sides; one year, said once, reads better.
      const month = new Intl.DateTimeFormat(locale, {
        month: monthStyle(style),
        timeZone: 'UTC',
      });
      return `${month.format(start)} — ${month.format(end)} ${end.getUTCFullYear()}`;
    }
    return tidyRange(
      new Intl.DateTimeFormat(locale, {
        month: monthStyle(style),
        year: 'numeric',
        timeZone: 'UTC',
      }).formatRange(start, end),
    );
  }
  return formatPublicDateRange(period, locale, style);
}

/**
 * One end of a period, as the owner knows it: alone ("апрель 2019") and as it
 * reads after a preposition that governs the genitive ("с апреля 2019"). A
 * full date already reads after either; a year is the same both ways.
 */
export function formatPublicDateAtPrecision(
  date: string,
  precision: DatePrecision | undefined,
  locale: string,
  style: 'long' | 'short' | 'abbreviated' = 'long',
): { standalone: string; governed: string } {
  const value = toUtcDate(date);
  if (precision === 'year') {
    const year = String(value.getUTCFullYear());
    return { standalone: year, governed: year };
  }
  if (precision === 'month') {
    const standalone = tidyRange(
      new Intl.DateTimeFormat(locale, {
        month: monthStyle(style),
        year: 'numeric',
        timeZone: 'UTC',
      }).format(value),
    );
    if (style === 'short') return { standalone, governed: standalone };
    // The month as it reads after a day — "апреля", not "апрель" — which is
    // the form a governing preposition asks for.
    const month = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: monthStyle(style),
      timeZone: 'UTC',
    })
      .formatToParts(value)
      .find((part) => part.type === 'month')!.value;
    return { standalone, governed: `${month} ${value.getUTCFullYear()}` };
  }
  const full =
    style === 'abbreviated'
      ? formatPublicDateRange({ startDate: date, endDate: date }, locale, style)
      : formatAbsolutePublicDate(date, locale, style);
  return { standalone: full, governed: full };
}

function monthStyle(style: 'long' | 'short' | 'abbreviated') {
  return style === 'short'
    ? '2-digit'
    : style === 'abbreviated'
      ? 'short'
      : 'long';
}

/**
 * A period as briefly as it can honestly be said, for a line of a card:
 * years when it spans years or is only known to the year, months within one
 * year or when only the month is known, days within one month.
 */
export function formatCompactPublicPeriod(
  period: DateRange & { precision?: DatePrecision },
  locale: string,
): string {
  const start = toUtcDate(period.startDate);
  const end = toUtcDate(period.endDate);
  const precision = period.precision ?? 'exact';
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  if (startYear !== endYear || precision === 'year')
    return startYear === endYear
      ? String(startYear)
      : `${startYear} — ${endYear}`;
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  if (!sameMonth || precision === 'month') {
    if (sameMonth)
      return tidyRange(
        new Intl.DateTimeFormat(locale, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(start),
      );
    // Intl repeats the year on both sides; one year, said once, reads better.
    const month = new Intl.DateTimeFormat(locale, {
      month: 'long',
      timeZone: 'UTC',
    });
    return `${month.format(start)} — ${month.format(end)} ${endYear}`;
  }
  if (period.startDate === period.endDate)
    return formatAbsolutePublicDate(period.startDate, locale);
  return formatPublicDateRange(period, locale);
}

/**
 * A day as a tear-off calendar leaf shows it: the weekday, the day, the
 * month as it reads after a day — "сентября", not "сентябрь" — and the year.
 */
export function publicCalendarDay(
  day: string,
  locale: string,
): { weekday: string; day: string; month: string; year: string } {
  const date = toUtcDate(day);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  return {
    weekday: format({ weekday: 'long' }).format(date),
    day: String(date.getUTCDate()),
    month: format({ day: 'numeric', month: 'long' })
      .formatToParts(date)
      .find((part) => part.type === 'month')!.value,
    year: String(date.getUTCFullYear()),
  };
}
