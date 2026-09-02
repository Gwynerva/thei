import { describe, expect, it } from 'vitest';
import {
  formatPublicDate,
  getPublicDatePresentation,
} from '../../../app/composables/public-date';

const now = new Date('2026-08-23T18:30:00Z');

describe('formatPublicDate', () => {
  it('includes the year without the Russian year suffix', () => {
    expect(formatPublicDate('2026-08-23', 'ru', new Date('2027-01-01'))).toBe(
      '23 августа 2026',
    );
  });

  it('keeps the locale date order', () => {
    expect(formatPublicDate('2026-08-23', 'en', new Date('2027-01-01'))).toBe(
      'August 23, 2026',
    );
  });

  it('formats recent dates relatively and provides the absolute popup title', () => {
    expect(getPublicDatePresentation('2026-08-23', 'ru', now)).toEqual({
      label: 'сегодня',
      title: '23 августа 2026',
    });
    expect(getPublicDatePresentation('2026-08-22', 'ru', now).label).toBe(
      'вчера',
    );
    expect(getPublicDatePresentation('2026-08-21', 'ru', now).label).toBe(
      '2 дня назад',
    );
    expect(getPublicDatePresentation('2026-08-02', 'ru', now).label).toBe(
      '3 недели назад',
    );
  });

  it('uses one clamped UTC calendar month as the relative boundary', () => {
    const monthEnd = new Date('2026-08-31T23:59:59Z');
    expect(getPublicDatePresentation('2026-07-31', 'ru', monthEnd).label).toBe(
      'месяц назад',
    );
    expect(getPublicDatePresentation('2026-07-30', 'ru', monthEnd).label).toBe(
      '30 июля 2026',
    );
  });

  it('keeps old and future single dates absolute', () => {
    expect(formatPublicDate('2026-07-22', 'ru', now)).toBe('22 июля 2026');
    expect(formatPublicDate('2026-08-24', 'ru', now)).toBe('24 августа 2026');
  });

  it('formats ranges compactly and never relatively', () => {
    expect(
      formatPublicDate(
        { startDate: '2027-12-04', endDate: '2027-12-06' },
        'ru',
        now,
      ),
    ).toBe('4–6 декабря 2027');
    expect(
      formatPublicDate(
        { startDate: '2026-07-31', endDate: '2026-08-02' },
        'ru',
        now,
      ),
    ).toBe('31 июля — 2 августа 2026');
    expect(
      formatPublicDate(
        { startDate: '2026-12-31', endDate: '2027-01-02' },
        'ru',
        now,
      ),
    ).toBe('31 декабря 2026 — 2 января 2027');
  });
});
