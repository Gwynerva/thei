import type { DateRange } from '#layers/thei/shared/date-range';
import {
  datePrecisionTone,
  isApproximateDate,
  type DatedPeriod,
  type DatePrecision,
  type DatePrecisionTone,
} from '#layers/thei/shared/date-precision';

export type PublicDateValue = string | DateRange | DatedPeriod;

export type PublicDatePresentation = {
  label: string;
  /** The hover explanation: the exact date, the doubt, or both. */
  title?: string;
  /** True when the owner said the date is a guess. */
  approximate?: boolean;
  tone?: DatePrecisionTone;
};

export type PublicDatePresentationOptions = {
  relativeMonths?: number;
  style?: 'long' | 'short';
  /**
   * How the doubt should be worded. The composable knows the precision but not
   * the language, so the caller hands it the phrases.
   */
  precisionLabels?: Partial<Record<DatePrecision, string>>;
};

/**
 * The wording of each level of doubt. The formatter knows the precision but
 * not the language, so every caller passes these in from the phrase table.
 */
export function publicDatePrecisionLabels(): Partial<
  Record<DatePrecision, string>
> {
  return {
    day: phrase.value.date_precision_day,
    month: phrase.value.date_precision_month,
    year: phrase.value.date_precision_year,
  };
}

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
    return withPrecision(
      { label: formatPublicDateRange(value, locale, style) },
      value,
      options,
    );
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

/**
 * Adds the owner's doubt to a presentation, stacking it under whatever the
 * hover text already said rather than replacing it.
 */
function withPrecision(
  presentation: PublicDatePresentation,
  value: DateRange | DatedPeriod,
  options: PublicDatePresentationOptions,
): PublicDatePresentation {
  if (!('precision' in value) || !isApproximateDate(value.precision))
    return presentation;
  const parts = [
    presentation.title,
    options.precisionLabels?.[value.precision],
    value.precisionNote || undefined,
  ].filter(Boolean);
  return {
    ...presentation,
    approximate: true,
    tone: datePrecisionTone(value.precision),
    title: parts.length ? parts.join(' \u00b7 ') : undefined,
  };
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

/** The colour a presentation's doubt is shown in, as a Tailwind class. */
export function datePresentationToneClass(
  presentation: PublicDatePresentation,
): string {
  switch (presentation.tone) {
    case 'warning':
      return 'text-text-warning';
    case 'alert':
      return 'text-text-error';
    default:
      return '';
  }
}
