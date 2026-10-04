import type { DateRange } from '#layers/thei/shared/date-range';
import {
  formatAbsolutePublicDate,
  formatPublicPeriodAtPrecision,
  toUtcDate,
} from '#layers/thei/shared/public-date-format';
import {
  datePrecisionTone,
  isApproximateDate,
  type DatedPeriod,
  type DatePrecision,
  type DatePrecisionTone,
} from '#layers/thei/shared/date-precision';
import {
  TITLE_POPUP_GAP,
  type TitlePopupLine,
} from '#layers/thei/app/composables/title-popup-content';

// The spelling of dates is shared with the server, which draws them on
// Open Graph cards; the page's own presentation of them stays here.
export { formatAbsolutePublicDate };

export type PublicDateValue = string | DateRange | DatedPeriod;

export type PublicDatePresentation = {
  label: string;
  /** The hover explanation: the exact date, the doubt, or both. */
  title?: TitlePopupLine[];
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
  /** Gives the owner's words for the doubt their typography. */
  formatNote?: (note: string) => string;
};

/**
 * The wording of a doubt in the current language: the precision phrases and
 * the owner's typography for their own note, for the options above.
 */
export function publicDatePrecisionOptions(): Pick<
  PublicDatePresentationOptions,
  'precisionLabels' | 'formatNote'
> {
  return {
    precisionLabels: publicDatePrecisionLabels(),
    formatNote: publicText,
  };
}

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
      {
        label: formatPublicPeriodAtPrecision(
          value as DatedPeriod,
          locale,
          style,
        ),
      },
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
        title: [formatAbsolutePublicDate(value, locale)],
      }
    : { label: absolute };
}

/**
 * The doubt, spelled out for a popup: its level, then, after a blank line, the
 * owner's own words for it.
 */
export function approximateDateTitle(
  precision: DatePrecision,
  note: string,
  precisionLabels: Partial<Record<DatePrecision, string>>,
  formatNote: (note: string) => string = (text) => text,
): TitlePopupLine[] {
  const lines: TitlePopupLine[] = [];
  const level = precisionLabels[precision];
  if (level) lines.push(level);
  if (note)
    lines.push(TITLE_POPUP_GAP, { text: formatNote(note), italic: true });
  return lines;
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
  const title = [
    ...(presentation.title ?? []),
    ...approximateDateTitle(
      value.precision,
      value.precisionNote,
      options.precisionLabels ?? {},
      options.formatNote,
    ),
  ];
  return {
    ...presentation,
    approximate: true,
    tone: datePrecisionTone(value.precision),
    title: title.length ? title : undefined,
  };
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
