import { describe, expect, it } from 'vitest';
import { coverDateRanges } from '../../shared/date-range';

describe('coverDateRanges', () => {
  it('keeps a single range unchanged', () => {
    expect(
      coverDateRanges([{ startDate: '2026-04-03', endDate: '2026-04-08' }]),
    ).toEqual({ startDate: '2026-04-03', endDate: '2026-04-08' });
  });

  it('covers gaps between separate periods', () => {
    expect(
      coverDateRanges([
        { startDate: '2026-04-03', endDate: '2026-04-08' },
        { startDate: '2026-07-14', endDate: '2026-07-19' },
      ]),
    ).toEqual({ startDate: '2026-04-03', endDate: '2026-07-19' });
  });

  it('uses the earliest start and latest end regardless of input order', () => {
    expect(
      coverDateRanges([
        { startDate: '2027-01-10', endDate: '2027-02-02' },
        { startDate: '2026-08-21', endDate: '2026-09-03' },
        { startDate: '2026-12-15', endDate: '2027-03-18' },
      ]),
    ).toEqual({ startDate: '2026-08-21', endDate: '2027-03-18' });
  });

  it('rejects an empty collection', () => {
    expect(() => coverDateRanges([])).toThrow(
      'At least one date range is required',
    );
  });
});
