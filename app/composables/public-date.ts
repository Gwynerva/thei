import type { DateRange } from '#layers/thei/shared/date-range';

export type PublicDateValue = string | DateRange;

export type PublicDatePresentation = {
  label: string;
  title?: string;
};

export type PublicDatePresentationOptions = {
  relativeMonths?: number;
  style?: 'long' | 'short';
};

export function formatPublicMonthDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(toUtcDate(date));
}

export function formatPublicRewindDate(
  date: string,
  period: DateRange | undefined,
  locale: string,
): string {
  return period ? formatPublicDate(period, locale) : date.slice(0, 4);
}

export function formatPublicDate(
  value: PublicDateValue,
  locale: string,
  now = new Date(),
  options: PublicDatePresentationOptions = {},
): string {
  return getPublicDatePresentation(value, locale, now, options).label;
}

export function getPublicDatePresentation(
  value: PublicDateValue,
  locale: string,
  now = new Date(),
  options: PublicDatePresentationOptions = {},
): PublicDatePresentation {
  const style = options.style ?? 'long';
  if (typeof value !== 'string') {
    return { label: formatPublicDateRange(value, locale, style) };
  }

  const absolute = formatAbsolutePublicDate(value, locale, style);
  const relative = formatRecentPublicDate(
    value,
    locale,
    now,
    options.relativeMonths ?? 1,
    style,
  );
  return relative
    ? {
        label: relative,
        title: formatAbsolutePublicDate(value, locale),
      }
    : { label: absolute };
}

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
  }).formatToParts(new Date(`${date}T00:00:00Z`));

  while (parts.at(-1)?.type === 'literal') parts.pop();
  return parts.map((part) => part.value).join('');
}

function formatPublicDateRange(
  period: DateRange,
  locale: string,
  style: 'long' | 'short',
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: style === 'short' ? '2-digit' : 'numeric',
    month: style === 'short' ? '2-digit' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return formatter
    .formatRange(toUtcDate(period.startDate), toUtcDate(period.endDate))
    .replaceAll(/\s*г\./g, '')
    .replaceAll(' – ', ' — ')
    .trim();
}

function formatRecentPublicDate(
  date: string,
  locale: string,
  now: Date,
  relativeMonths: number,
  style: 'long' | 'short',
): string | undefined {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const target = toUtcDate(date).getTime();
  if (target > today) return undefined;

  if (relativeMonths <= 0) return undefined;
  const relativeBoundary = clampedUtcDate(
    now.getUTCFullYear(),
    now.getUTCMonth() - relativeMonths,
    now.getUTCDate(),
  ).getTime();
  if (target < relativeBoundary) return undefined;

  const days = Math.round((today - target) / 86_400_000);
  if (days < 7) {
    return new Intl.RelativeTimeFormat(locale, {
      numeric: days < 2 ? 'auto' : 'always',
      style,
    }).format(-days, 'day');
  }
  if (days < 28) {
    return new Intl.RelativeTimeFormat(locale, {
      numeric: 'always',
      style,
    }).format(-Math.round(days / 7), 'week');
  }
  const months = Math.max(
    1,
    Math.min(relativeMonths, Math.round(days / 30.4375)),
  );
  const formatted = new Intl.RelativeTimeFormat(locale, {
    numeric: 'always',
    style,
  }).format(-months, 'month');
  return style === 'long' ? formatted.replace(/^1\s+/u, '') : formatted;
}

function toUtcDate(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function clampedUtcDate(year: number, month: number, day: number) {
  const normalized = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      normalized.getUTCFullYear(),
      normalized.getUTCMonth(),
      Math.min(day, lastDay),
    ),
  );
}
