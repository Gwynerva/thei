import { describe, expect, it } from 'vitest';
import {
  buildPaginationItems,
  paginate,
  resolvePagination,
} from '../../shared/pagination';

describe('buildPaginationItems', () => {
  it('shows every page for short ranges', () => {
    expect(buildPaginationItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps five pages at the start until the current page leaves them', () => {
    for (const page of [1, 2, 3, 4]) {
      expect(buildPaginationItems(page, 12)).toEqual([
        1,
        2,
        3,
        4,
        5,
        'ellipsis-after',
        12,
      ]);
    }
  });

  it('slides the neighbours along away from the ends', () => {
    expect(buildPaginationItems(5, 12)).toEqual([
      1,
      'ellipsis-before',
      4,
      5,
      6,
      'ellipsis-after',
      12,
    ]);
    expect(buildPaginationItems(8, 12)).toEqual([
      1,
      'ellipsis-before',
      7,
      8,
      9,
      'ellipsis-after',
      12,
    ]);
  });

  it('keeps five pages at the end once the current page reaches them', () => {
    for (const page of [9, 10, 11, 12]) {
      expect(buildPaginationItems(page, 12)).toEqual([
        1,
        'ellipsis-before',
        8,
        9,
        10,
        11,
        12,
      ]);
    }
  });

  it('never hides a single page behind a gap', () => {
    expect(buildPaginationItems(4, 8)).toEqual([
      1,
      2,
      3,
      4,
      5,
      'ellipsis-after',
      8,
    ]);
    expect(buildPaginationItems(5, 8)).toEqual([
      1,
      'ellipsis-before',
      4,
      5,
      6,
      7,
      8,
    ]);
  });

  it('clamps invalid current pages', () => {
    expect(buildPaginationItems(99, 12)).toEqual(buildPaginationItems(12, 12));
  });

  it.each([
    [Number.NaN, Number.NaN],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    [-1, 0],
    [0.5, 0.5],
  ])('normalizes non-finite and non-positive inputs', (page, pageCount) => {
    expect(buildPaginationItems(page, pageCount)).toEqual([1]);
  });

  it('keeps every range valid, reachable and of constant width', () => {
    for (let pageCount = 1; pageCount <= 100; pageCount += 1) {
      for (let page = 1; page <= pageCount; page += 1) {
        const items = buildPaginationItems(page, pageCount);
        const pages = items.filter(
          (item): item is number => typeof item === 'number',
        );

        expect(items).toHaveLength(Math.min(pageCount, 7));
        expect(pages).toEqual([...pages].sort((a, b) => a - b));
        expect(new Set(pages).size).toBe(pages.length);
        expect(pages[0]).toBe(1);
        expect(pages.at(-1)).toBe(pageCount);
        for (const neighbour of [page - 1, page, page + 1]) {
          if (neighbour >= 1 && neighbour <= pageCount) {
            expect(pages).toContain(neighbour);
          }
        }
        items.forEach((item, index) => {
          if (typeof item === 'number') return;
          const before = items[index - 1] as number;
          const after = items[index + 1] as number;
          expect(after - before - 1).toBeGreaterThanOrEqual(2);
        });
      }
    }
  });
});

describe('resolvePagination', () => {
  it('clamps the requested page to the pages that exist', () => {
    expect(resolvePagination(41, 99, 20)).toEqual({
      total: 41,
      page: 3,
      pageSize: 20,
      pageCount: 3,
    });
    expect(resolvePagination(41, -2, 20)).toMatchObject({ page: 1 });
  });

  it.each([
    [undefined, 1],
    ['', 1],
    ['abc', 1],
    ['2', 2],
    ['2.7', 2],
    [['2'], 2],
    [['2', '3'], 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])('reads the page value %j as page %i', (value, page) => {
    expect(resolvePagination(100, value, 10).page).toBe(page);
  });

  it('keeps one empty page for an empty or broken total', () => {
    for (const total of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolvePagination(total, 3, 20)).toEqual({
        total: 0,
        page: 1,
        pageSize: 20,
        pageCount: 1,
      });
    }
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1);

  it('returns one page of the items with its pagination', () => {
    expect(paginate(items, 2, 10)).toEqual({
      items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      total: 25,
      page: 2,
      pageSize: 10,
      pageCount: 3,
    });
  });

  it('returns the last page for a page past the end', () => {
    expect(paginate(items, 9, 10).items).toEqual([21, 22, 23, 24, 25]);
  });
});
