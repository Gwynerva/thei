export function publicPagination(
  total: number,
  pageValue: unknown,
  pageSize = 24,
) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number(pageValue);
  const page = Number.isInteger(requested)
    ? Math.min(pageCount, Math.max(1, requested))
    : 1;
  return { page, pageSize, pageCount, total };
}
