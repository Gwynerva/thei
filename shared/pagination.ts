export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type PaginationInfo = Omit<PaginatedResponse<never>, 'items'>;

export type PaginationItem = number | 'ellipsis-before' | 'ellipsis-after';

/**
 * Resolves the requested page of `total` items. Whatever the page value is —
 * a query string, a fraction, garbage — it lands on an existing page, so a
 * list past its end shows its last page rather than nothing.
 */
export function resolvePagination(
  total: number,
  page: unknown,
  pageSize: number,
): PaginationInfo {
  const count = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const size = positiveInteger(pageSize, 1);
  const pageCount = Math.max(1, Math.ceil(count / size));
  const requested = Number(page);
  return {
    total: count,
    page: Number.isFinite(requested)
      ? Math.min(pageCount, Math.max(1, Math.trunc(requested)))
      : 1,
    pageSize: size,
    pageCount,
  };
}

/** One page of a list that is already whole in memory. */
export function paginate<T>(
  items: T[],
  page: unknown,
  pageSize: number,
): PaginatedResponse<T> {
  const pagination = resolvePagination(items.length, page, pageSize);
  const offset = (pagination.page - 1) * pagination.pageSize;
  return {
    ...pagination,
    items: items.slice(offset, offset + pagination.pageSize),
  };
}

/** Numbered slots once the pages no longer all fit. */
const SLOTS = 7;

/** Pages in a run that touches an end: every slot but the far end and its gap. */
const RUN = SLOTS - 2;

/**
 * Builds the numbered part of a pagination: the first and the last page, the
 * current one with both neighbours, and gaps for the rest. Past seven pages it
 * always fills exactly seven slots, so the bar keeps its width while the reader
 * moves through it, and a gap always stands for at least two pages.
 */
export function buildPaginationItems(
  page: number,
  pageCount: number,
): PaginationItem[] {
  const lastPage = positiveInteger(pageCount, 1);
  const currentPage = Math.min(lastPage, positiveInteger(page, 1));

  if (lastPage <= SLOTS) return range(1, lastPage);

  if (currentPage < RUN) {
    return [...range(1, RUN), 'ellipsis-after', lastPage];
  }

  if (currentPage > lastPage - RUN + 1) {
    return [1, 'ellipsis-before', ...range(lastPage - RUN + 1, lastPage)];
  }

  return [
    1,
    'ellipsis-before',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis-after',
    lastPage,
  ];
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.trunc(value) : fallback;
}
