import { describe, expect, it } from 'vitest';
import {
  lifePointMark,
  publicPeriodState,
  publicTimelineGapBefore,
  publicTimelineGapDuration,
  publicTimelineHasGap,
  publicTimelineIsDay,
  publicTimelinePeriodDuration,
  sortPublicTimelineItemsNewestFirst,
} from '../../shared/public-timeline';

describe('public timeline ranges', () => {
  it('orders ranges by their newest visible boundary without mutating input', () => {
    const periods = [
      { startDate: '2026-01-01', endDate: '2026-01-10' },
      { startDate: '2026-02-01', endDate: '2026-02-03' },
      { startDate: '2026-01-20', endDate: '2026-02-03' },
    ];

    expect(
      sortPublicTimelineItemsNewestFirst(periods, (period) => period),
    ).toEqual([periods[1], periods[2], periods[0]]);
    expect(periods[0]!.startDate).toBe('2026-01-01');
  });

  it('measures elapsed calendar time between the nearest range boundaries', () => {
    expect(
      publicTimelineGapDuration(
        { startDate: '2026-03-05', endDate: '2026-03-20' },
        { startDate: '2026-01-20', endDate: '2026-01-31' },
      ),
    ).toEqual({ years: 0, months: 1, days: 5 });
    expect(
      publicTimelineGapDuration(
        { startDate: '2026-03-02', endDate: '2026-03-04' },
        { startDate: '2024-02-20', endDate: '2024-02-29' },
      ),
    ).toEqual({ years: 2, months: 0, days: 2 });
    expect(
      publicTimelineGapDuration(
        { startDate: '2026-05-05', endDate: '2026-05-06' },
        { startDate: '2026-04-16', endDate: '2026-04-16' },
      ),
    ).toEqual({ years: 0, months: 0, days: 19 });
    expect(
      publicTimelineGapDuration(
        { startDate: '2026-03-01', endDate: '2026-03-03' },
        { startDate: '2026-01-30', endDate: '2026-01-31' },
      ),
    ).toEqual({ years: 0, months: 1, days: 1 });
  });

  it('does not create a gap for touching or overlapping ranges', () => {
    const duration = publicTimelineGapDuration(
      { startDate: '2026-02-01', endDate: '2026-02-10' },
      { startDate: '2026-01-20', endDate: '2026-02-01' },
    );
    expect(duration).toEqual({ years: 0, months: 0, days: 0 });
    expect(publicTimelineHasGap(duration)).toBe(false);
  });

  it('distinguishes a day from a period', () => {
    expect(
      publicTimelineIsDay({
        startDate: '2026-08-23',
        endDate: '2026-08-23',
      }),
    ).toBe(true);
    expect(
      publicTimelineIsDay({
        startDate: '2026-08-22',
        endDate: '2026-08-23',
      }),
    ).toBe(false);
    // Known only to the month or the year, a stretch within one is a moment.
    expect(
      publicTimelineIsDay({
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        precision: 'month',
      }),
    ).toBe(true);
    expect(
      publicTimelineIsDay({
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        precision: 'year',
      }),
    ).toBe(false);
  });

  it('counts both boundary dates in a period duration', () => {
    expect(
      publicTimelinePeriodDuration({
        startDate: '2026-05-05',
        endDate: '2026-05-06',
      }),
    ).toEqual({ years: 0, months: 0, days: 2 });
    expect(
      publicTimelinePeriodDuration({
        startDate: '2026-01-31',
        endDate: '2026-02-01',
      }),
    ).toEqual({ years: 0, months: 0, days: 2 });
    expect(
      publicTimelinePeriodDuration({
        startDate: '2025-12-31',
        endDate: '2026-03-03',
      }),
    ).toEqual({ years: 0, months: 2, days: 4 });
  });

  it('measures a gap from everything newer, not just the neighbour', () => {
    // The long period covers the days between the two short ones inside it.
    const ordered = [
      { startDate: '2026-01-01', endDate: '2026-01-20' },
      { startDate: '2026-01-05', endDate: '2026-01-10' },
      { startDate: '2026-01-01', endDate: '2026-01-03' },
    ];
    expect(publicTimelineHasGap(publicTimelineGapBefore(ordered, 1))).toBe(
      false,
    );
    expect(publicTimelineHasGap(publicTimelineGapBefore(ordered, 2))).toBe(
      false,
    );
    expect(
      publicTimelineGapBefore(
        [
          { startDate: '2026-03-01', endDate: '2026-03-02' },
          { startDate: '2026-01-01', endDate: '2026-01-31' },
        ],
        1,
      ),
    ).toEqual({ years: 0, months: 1, days: 1 });
    expect(publicTimelineGapBefore(ordered, 0)).toEqual({
      years: 0,
      months: 0,
      days: 0,
    });
  });

  it('marks the start, the end and a single day of a period', () => {
    const range = { startDate: '2026-03-01', endDate: '2026-03-05' };
    expect(lifePointMark({ transition: 'started' })).toBe('start');
    expect(lifePointMark({ transition: 'started', ongoing: true })).toBe(
      'ongoing',
    );
    expect(lifePointMark({ transition: 'ended', period: range })).toBe('end');
    expect(lifePointMark({ transition: 'occurred' })).toBe('day');
    expect(lifePointMark({ transition: 'occurred', period: range })).toBe(
      'span',
    );
    expect(
      lifePointMark({ transition: 'occurred', period: range }, 'ongoing'),
    ).toBe('ongoing');
    expect(lifePointMark({ transition: 'created' })).toBeUndefined();
  });
});

describe('publicPeriodState', () => {
  const period = { startDate: '2026-03-01', endDate: '2026-03-10' };
  it('tells a period gone by, still running, or yet to come', () => {
    expect(publicPeriodState(period, '2026-03-10')).toBe('past');
    expect(publicPeriodState(period, '2026-03-09')).toBe('ongoing');
    expect(publicPeriodState(period, '2026-03-01')).toBe('ongoing');
    expect(publicPeriodState(period, '2026-02-28')).toBe('upcoming');
  });
});
