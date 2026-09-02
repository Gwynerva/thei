import { describe, expect, it } from 'vitest';
import {
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
});
