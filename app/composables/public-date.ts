import type { DateRange } from '#layers/thei/shared/date-range';

export type PublicDateValue = string | DateRange;

export type PublicDatePresentation = {
  label: string;
  title?: string;
};

export function formatPublicDate(
  value: PublicDateValue,
  locale: string,
  now = new Date(),
): string {
  return getPublicDatePresentation(value, locale, now).label;
}

export function getPublicDatePresentation(
  value: PublicDateValue,
  locale: string,
  now = new Date(),
): PublicDatePresentation {
  if (typeof value !== 'string') {
    return { label: formatPublicDateRange(value, locale) };
  }

  const absolute = formatAbsolutePublicDate(value, locale);
  const relative = formatRecentPublicDate(value, locale, now);
  return relative ? { label: relative, title: absolute } : { label: absolute };
}

export function formatAbsolutePublicDate(date: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${date}T00:00:00Z`));

  while (parts.at(-1)?.type === 'literal') parts.pop();
  return parts.map((part) => part.value).join('');
}

function formatPublicDateRange(period: DateRange, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
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
): string | undefined {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const target = toUtcDate(date).getTime();
  if (target > today) return undefined;

  const previousMonth = clampedUtcDate(
    now.getUTCFullYear(),
    now.getUTCMonth() - 1,
    now.getUTCDate(),
  ).getTime();
  if (target < previousMonth) return undefined;

  const days = Math.round((today - target) / 86_400_000);
  if (days < 7) {
    return new Intl.RelativeTimeFormat(locale, {
      numeric: days < 2 ? 'auto' : 'always',
    }).format(-days, 'day');
  }
  if (days < 28) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(
      -Math.round(days / 7),
      'week',
    );
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
    .format(-1, 'month')
    .replace(/^1\s+/u, '');
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
