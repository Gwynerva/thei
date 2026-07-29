import { describe, expect, it } from 'vitest';
import {
  normalizeProjectContentSectionPeriods,
  normalizeProjectContentSections,
} from '../../shared/project-content-section';

describe('project content section periods', () => {
  it('sorts and merges overlapping or adjacent date-only periods', () => {
    expect(
      normalizeProjectContentSectionPeriods([
        { startDate: '2026-06-06', endDate: '2026-06-07' },
        { startDate: '2026-06-01', endDate: '2026-06-04' },
        { startDate: '2026-06-04', endDate: '2026-06-05' },
      ]),
    ).toEqual([{ startDate: '2026-06-01', endDate: '2026-06-07' }]);
  });

  it('keeps every precise period separate and sorts all periods by start', () => {
    expect(
      normalizeProjectContentSectionPeriods([
        { startDate: '2026-06-06T12:00', endDate: '2026-06-06T14:00' },
        { startDate: '2026-06-07', endDate: '2026-06-07' },
        { startDate: '2026-06-06', endDate: '2026-06-06' },
        { startDate: '2026-06-06T10:00', endDate: '2026-06-06T12:00' },
        { startDate: '2026-06-08', endDate: '2026-06-09' },
      ]),
    ).toEqual([
      { startDate: '2026-06-06', endDate: '2026-06-09' },
      { startDate: '2026-06-06T10:00', endDate: '2026-06-06T12:00' },
      { startDate: '2026-06-06T12:00', endDate: '2026-06-06T14:00' },
    ]);
    expect(
      normalizeProjectContentSectionPeriods([
        { startDate: '2026-06-01', endDate: '2026-06-05' },
        { startDate: '2026-06-02T10:00', endDate: '2026-06-02T12:00' },
      ]),
    ).toEqual([
      { startDate: '2026-06-01', endDate: '2026-06-05' },
      { startDate: '2026-06-02T10:00', endDate: '2026-06-02T12:00' },
    ]);
  });

  it('allows independently specified boundary times and rejects invalid values', () => {
    expect(
      normalizeProjectContentSectionPeriods([
        { startDate: '2026-06-06', endDate: '2026-06-06T10:00' },
      ]),
    ).toEqual([{ startDate: '2026-06-06', endDate: '2026-06-06T10:00' }]);
    expect(() =>
      normalizeProjectContentSectionPeriods([
        { startDate: '2026-06-06T10:00', endDate: '2026-06-05T10:00' },
      ]),
    ).toThrow('Invalid section period');
    expect(() =>
      normalizeProjectContentSectionPeriods([
        { startDate: '2026-02-29', endDate: '2026-03-01' },
      ]),
    ).toThrow('Invalid section period');
  });

  it('rejects empty section titles', () => {
    expect(() =>
      normalizeProjectContentSections([
        { title: ' ', summary: '', isPrivate: false, periods: [] },
      ]),
    ).toThrow('Content section title cannot be empty');
  });

  it('trims the optional section summary', () => {
    expect(
      normalizeProjectContentSections([
        {
          title: 'Title',
          summary: '  A short explanation  ',
          isPrivate: false,
          periods: [],
        },
      ]),
    ).toMatchObject([{ title: 'Title', summary: 'A short explanation' }]);
  });
});
