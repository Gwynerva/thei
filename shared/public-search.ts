export type PublicSearchType = 'project' | 'event';

export interface PublicSearchFilters {
  q: string;
  /** Both kinds when absent. */
  type?: PublicSearchType;
  /** Project-only filters; they rule events out while active. */
  showcase: boolean;
  cv: boolean;
  /** Tag slugs every result must have. */
  tags: string[];
  /** Tag slugs no result may have. */
  exclude: string[];
}

export const PUBLIC_SEARCH_QUERY_MAX_LENGTH = 200;
export const PUBLIC_SEARCH_DEBOUNCE_MS = 450;

function queryString(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : '';
}

function slugList(value: unknown): string[] {
  return [
    ...new Set(
      queryString(value)
        .split(',')
        .map((slug) => slug.trim())
        .filter(Boolean),
    ),
  ];
}

export function parsePublicSearchFilters(
  query: Record<string, unknown>,
): PublicSearchFilters & { page: number } {
  const type = queryString(query.type);
  const tags = slugList(query.tags);
  const page = Number(queryString(query.page));
  return {
    q: queryString(query.q).slice(0, PUBLIC_SEARCH_QUERY_MAX_LENGTH),
    ...(type === 'project' || type === 'event' ? { type } : {}),
    showcase: type !== 'event' && queryString(query.showcase) === '1',
    cv: type !== 'event' && queryString(query.cv) === '1',
    tags,
    exclude: slugList(query.exclude).filter((slug) => !tags.includes(slug)),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The URL query of a search; defaults are left out so links stay short. */
export function publicSearchQuery(
  filters: PublicSearchFilters,
  page = 1,
): Record<string, string> {
  const q = filters.q.trim();
  const projects = filters.type !== 'event';
  return {
    ...(q ? { q } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(projects && filters.showcase ? { showcase: '1' } : {}),
    ...(projects && filters.cv ? { cv: '1' } : {}),
    ...(filters.tags.length ? { tags: filters.tags.join(',') } : {}),
    ...(filters.exclude.length ? { exclude: filters.exclude.join(',') } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  };
}

/** Filters beyond the text query, shown as a count on the mobile toggle. */
export function countPublicSearchFilters(filters: PublicSearchFilters) {
  return (
    (filters.type ? 1 : 0) +
    (filters.showcase ? 1 : 0) +
    (filters.cv ? 1 : 0) +
    filters.tags.length +
    filters.exclude.length
  );
}

export function normalizePublicSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/ё/g, 'е');
}

export function publicSearchTokens(q: string): string[] {
  return normalizePublicSearchText(q).split(/\s+/u).filter(Boolean);
}
