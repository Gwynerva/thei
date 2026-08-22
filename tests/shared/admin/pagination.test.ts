import { describe, expect, it } from 'vitest';
import { buildAdminPaginationItems } from '../../../shared/admin/pagination';

describe('buildAdminPaginationItems', () => {
  it('shows every page for short ranges', () => {
    expect(buildAdminPaginationItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('shows three pages at both edges near the start', () => {
    expect(buildAdminPaginationItems(2, 12)).toEqual([
      1,
      2,
      3,
      'ellipsis-before',
      10,
      11,
      12,
    ]);
  });

  it('keeps the current page centered away from the edges', () => {
    expect(buildAdminPaginationItems(6, 12)).toEqual([
      1,
      'ellipsis-before',
      5,
      6,
      7,
      'ellipsis-after',
      12,
    ]);
  });

  it('clamps invalid current pages', () => {
    expect(buildAdminPaginationItems(99, 12)).toEqual([
      1,
      2,
      3,
      'ellipsis-before',
      10,
      11,
      12,
    ]);
  });

  it.each([
    [Number.NaN, Number.NaN],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    [-1, 0],
  ])('normalizes non-finite and non-positive inputs', (page, pageCount) => {
    expect(buildAdminPaginationItems(page, pageCount)).toEqual([1]);
  });

  it('keeps pagination items valid across large ranges', () => {
    for (let pageCount = 1; pageCount <= 100; pageCount += 1) {
      for (let page = 1; page <= pageCount; page += 1) {
        const items = buildAdminPaginationItems(page, pageCount);
        const pages = items.filter((item): item is number =>
          Number.isInteger(item),
        );

        expect(items.length).toBeLessThanOrEqual(7);
        expect(pages).toContain(page);
        expect(new Set(pages).size).toBe(pages.length);
        expect(pages.every((item) => item >= 1 && item <= pageCount)).toBe(
          true,
        );
      }
    }
  });
});
