import { describe, expect, it } from 'vitest';
import {
  formatAbsolutePublicDate,
  formatCompactPublicPeriod,
  formatPublicDateAtPrecision,
  formatPublicDateRange,
  formatPublicPeriodAtPrecision,
  publicCalendarDay,
} from '../../shared/public-date-format';

/** Intl's own thin and no-break spaces, made visible for comparison. */
function plain(text: string) {
  return text.replaceAll(/[\u00A0\u2009\u202F]/g, ' ');
}

describe('formatCompactPublicPeriod', () => {
  const cases: [
    string,
    Parameters<typeof formatCompactPublicPeriod>[0],
    string,
    string,
  ][] = [
    [
      'spans years',
      { startDate: '2023-03-01', endDate: '2026-05-01' },
      '2023 — 2026',
      '2023 — 2026',
    ],
    [
      'spans months',
      { startDate: '2025-05-01', endDate: '2025-08-31' },
      'май — август 2025',
      'May — August 2025',
    ],
    [
      'spans days',
      { startDate: '2024-06-03', endDate: '2024-06-14' },
      '3–14 июня 2024',
      'June 3 – 14, 2024',
    ],
    [
      'is one day',
      { startDate: '2024-06-14', endDate: '2024-06-14' },
      '14 июня 2024',
      'June 14, 2024',
    ],
    [
      'is known to the month',
      { startDate: '2024-06-01', endDate: '2024-06-30', precision: 'month' },
      'июнь 2024',
      'June 2024',
    ],
    [
      'is known to the year',
      { startDate: '2009-01-01', endDate: '2009-12-31', precision: 'year' },
      '2009',
      '2009',
    ],
  ];
  for (const [name, period, ru, en] of cases)
    it(`says a period that ${name} briefly`, () => {
      expect(plain(formatCompactPublicPeriod(period, 'ru'))).toBe(ru);
      expect(plain(formatCompactPublicPeriod(period, 'en'))).toBe(en);
    });
});

describe('formatAbsolutePublicDate', () => {
  it('abbreviates the month for a chip, without the year abbreviation', () => {
    expect(
      plain(formatAbsolutePublicDate('2022-09-28', 'ru', 'abbreviated')),
    ).toBe('28 сент. 2022');
    expect(
      plain(formatAbsolutePublicDate('2022-05-03', 'ru', 'abbreviated')),
    ).toBe('3 мая 2022');
    expect(
      plain(formatAbsolutePublicDate('2022-09-28', 'en', 'abbreviated')),
    ).toBe('Sep 28, 2022');
    expect(plain(formatAbsolutePublicDate('2022-09-28', 'ru'))).toBe(
      '28 сентября 2022',
    );
  });

  it('is the abbreviated end of a period known to the day', () => {
    expect(
      formatPublicDateAtPrecision('2022-09-28', 'exact', 'ru', 'abbreviated')
        .standalone,
    ).toBe(formatAbsolutePublicDate('2022-09-28', 'ru', 'abbreviated'));
  });
});

describe('formatPublicDateRange', () => {
  it('abbreviates months and keeps August whole', () => {
    const range = { startDate: '2025-08-12', endDate: '2025-09-16' };
    expect(plain(formatPublicDateRange(range, 'ru', 'abbreviated'))).toBe(
      '12 авг. — 16 сент. 2025',
    );
    expect(
      plain(
        formatPublicDateRange(
          { startDate: '2026-11-11', endDate: '2026-11-12' },
          'ru',
          'abbreviated',
        ),
      ),
    ).toBe('11–12 нояб. 2026');
    expect(plain(formatPublicDateRange(range, 'ru'))).toBe(
      '12 августа — 16 сентября 2025',
    );
  });
});

describe('publicCalendarDay', () => {
  it('shows a day with its weekday, the month as it reads after a day', () => {
    expect(publicCalendarDay('2024-09-03', 'ru')).toEqual({
      weekday: 'вторник',
      day: '3',
      month: 'сентября',
      year: '2024',
    });
    expect(publicCalendarDay('2024-09-03', 'en')).toEqual({
      weekday: 'Tuesday',
      day: '3',
      month: 'September',
      year: '2024',
    });
  });
});

describe('formatPublicPeriodAtPrecision', () => {
  const period = (startDate: string, endDate: string, precision: string) =>
    ({ startDate, endDate, precision }) as never;

  it('prints a period no more exactly than the owner knows it', () => {
    expect(
      plain(
        formatPublicPeriodAtPrecision(
          period('2019-01-01', '2019-12-31', 'year'),
          'ru',
        ),
      ),
    ).toBe('2019');
    expect(
      plain(
        formatPublicPeriodAtPrecision(
          period('2019-01-01', '2021-12-31', 'year'),
          'en',
        ),
      ),
    ).toBe('2019 — 2021');
    expect(
      plain(
        formatPublicPeriodAtPrecision(
          period('2019-03-01', '2019-06-30', 'month'),
          'ru',
        ),
      ),
    ).toBe('март — июнь 2019');
    expect(
      plain(
        formatPublicPeriodAtPrecision(
          period('2019-03-01', '2019-03-31', 'month'),
          'en',
        ),
      ),
    ).toBe('March 2019');
    expect(
      plain(
        formatPublicPeriodAtPrecision(
          period('2019-11-01', '2020-02-29', 'month'),
          'ru',
        ),
      ),
    ).toBe('ноябрь 2019 — февраль 2020');
    expect(
      plain(
        formatPublicPeriodAtPrecision(
          period('2026-11-11', '2026-11-12', 'day'),
          'ru',
        ),
      ),
    ).toBe('11–12 ноября 2026');
  });
});

describe('formatPublicDateAtPrecision', () => {
  it('gives an end alone and after a preposition that governs the genitive', () => {
    expect(formatPublicDateAtPrecision('2019-04-15', 'month', 'ru')).toEqual({
      standalone: 'апрель 2019',
      governed: 'апреля 2019',
    });
    expect(formatPublicDateAtPrecision('2019-04-15', 'year', 'ru')).toEqual({
      standalone: '2019',
      governed: '2019',
    });
    expect(
      plain(formatPublicDateAtPrecision('2019-04-15', 'exact', 'ru').governed),
    ).toBe('15 апреля 2019');
    expect(formatPublicDateAtPrecision('2019-04-15', 'month', 'en')).toEqual({
      standalone: 'April 2019',
      governed: 'April 2019',
    });
  });
});
