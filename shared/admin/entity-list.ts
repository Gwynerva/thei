export const ADMIN_ENTITY_LIST_ORDERS = ['newest', 'oldest'] as const;

export type AdminEntityListOrder = (typeof ADMIN_ENTITY_LIST_ORDERS)[number];

export type AdminPaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type AdminPaginationInfo = Omit<AdminPaginatedResponse<never>, 'items'>;

export type AdminEntityListQuery = {
  q?: string;
  order?: AdminEntityListOrder;
  page?: number;
  pageSize?: number;
};

export type SearchableAdminEntity = {
  entityId: string;
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  createdAt: number;
  updatedAt: number;
  contentText?: string;
};

export type CanonicalAdminEntityListRouteQuery = {
  q?: string;
  order?: 'oldest';
  page?: number;
};

export function resolveAdminPagination(
  totalItems: number,
  query: Pick<AdminEntityListQuery, 'page' | 'pageSize'>,
): AdminPaginationInfo {
  const total = normalizeNonNegativeInteger(totalItems);
  const pageSize = clampInteger(query.pageSize, 1, 50, 20);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = clampInteger(query.page, 1, pageCount, 1);

  return { total, page, pageSize, pageCount };
}

export function canonicalizeAdminEntityListRouteQuery(
  query: Record<string, unknown>,
  resolvedPage?: number,
): CanonicalAdminEntityListRouteQuery {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const requestedPage = positiveInteger(query.page);
  const page =
    resolvedPage === undefined ? requestedPage : positiveInteger(resolvedPage);

  return {
    q: q || undefined,
    order: query.order === 'oldest' ? 'oldest' : undefined,
    page: page && page > 1 ? page : undefined,
  };
}

export function paginateAdminEntities<T extends SearchableAdminEntity>(
  items: T[],
  query: AdminEntityListQuery,
): AdminPaginatedResponse<T> {
  const q = normalizeAdminSearchText(query.q ?? '');
  const order = query.order === 'oldest' ? 'oldest' : 'newest';

  const filtered = q
    ? items.filter((item) =>
        [
          item.title,
          item.summary,
          item.humanReadableSlug,
          item.publicId,
          item.contentText ?? '',
        ].some((value) => normalizeAdminSearchText(value).includes(q)),
      )
    : [...items];

  filtered.sort((a, b) => {
    if (order === 'oldest') {
      return a.createdAt - b.createdAt || a.entityId.localeCompare(b.entityId);
    }
    return (
      b.updatedAt - a.updatedAt ||
      b.createdAt - a.createdAt ||
      a.entityId.localeCompare(b.entityId)
    );
  });

  const pagination = resolveAdminPagination(filtered.length, query);
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  return {
    items: filtered.slice(offset, offset + pageSize),
    ...pagination,
  };
}

export function normalizeAdminSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

function normalizeNonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}
