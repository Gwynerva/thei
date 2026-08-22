export type AdminPaginationItem = number | 'ellipsis-before' | 'ellipsis-after';

/**
 * Builds a compact numeric pagination. Large ranges keep at most three
 * adjacent page buttons in each visible group and use non-interactive gaps.
 */
export function buildAdminPaginationItems(
  page: number,
  pageCount: number,
): AdminPaginationItem[] {
  const lastPage = positiveInteger(pageCount, 1);
  const currentPage = Math.min(lastPage, positiveInteger(page, 1));

  if (lastPage <= 7) {
    return Array.from({ length: lastPage }, (_, index) => index + 1);
  }

  if (currentPage <= 3 || currentPage >= lastPage - 2) {
    return [1, 2, 3, 'ellipsis-before', lastPage - 2, lastPage - 1, lastPage];
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

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}
