import { SEARCH_KINDS, type SearchKind } from './search/api';
import { SEARCH_QUERY_MAX_LENGTH } from './search/tokens';

/** A kind the search narrows to: one of the kinds it finds. */
export type PublicSearchType = SearchKind;

export interface PublicSearchFilters {
  q: string;
  /** Every kind when absent. */
  type?: PublicSearchType;
  /** Project-only filters; they rule every other kind out while active. */
  showcase: boolean;
  cv: boolean;
  /** Tag slugs every result must have. */
  tags: string[];
  /** Tag slugs no result may have. */
  exclude: string[];
  /** Only what falls in this year. */
  year?: number;
  /** One kind read by its days, newest or oldest first, rather than best first. */
  sort?: 'new' | 'old';
}

export const PUBLIC_SEARCH_QUERY_MAX_LENGTH = SEARCH_QUERY_MAX_LENGTH;
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
  const known = (SEARCH_KINDS as readonly string[]).includes(type);
  const projects = !known || type === 'project';
  const tags = slugList(query.tags);
  const page = Number(queryString(query.page));
  const year = Number(queryString(query.year));
  return {
    q: queryString(query.q).slice(0, PUBLIC_SEARCH_QUERY_MAX_LENGTH),
    ...(known ? { type: type as PublicSearchType } : {}),
    showcase: projects && queryString(query.showcase) === '1',
    cv: projects && queryString(query.cv) === '1',
    tags,
    exclude: slugList(query.exclude).filter((slug) => !tags.includes(slug)),
    ...(Number.isInteger(year) && year > 999 && year < 10000 ? { year } : {}),
    ...(queryString(query.sort) === 'new' || queryString(query.sort) === 'old'
      ? { sort: queryString(query.sort) as 'new' | 'old' }
      : {}),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The URL query of a search; defaults are left out so links stay short. */
export function publicSearchQuery(
  filters: PublicSearchFilters,
  page = 1,
): Record<string, string> {
  const q = filters.q.trim();
  const projects = !filters.type || filters.type === 'project';
  return {
    ...(q ? { q } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(projects && filters.showcase ? { showcase: '1' } : {}),
    ...(projects && filters.cv ? { cv: '1' } : {}),
    ...(filters.tags.length ? { tags: filters.tags.join(',') } : {}),
    ...(filters.exclude.length ? { exclude: filters.exclude.join(',') } : {}),
    ...(filters.year ? { year: String(filters.year) } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
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
    filters.exclude.length +
    (filters.year ? 1 : 0)
  );
}

/**
 * A handful of filter combinations that are pages in their own right.
 *
 * With no text query and no tags, "only projects" is simply the site's list of
 * projects, and "only the CV" is a résumé. Naming them turns one search page
 * into several addressable ones: each gets a title, a description, a place in
 * the sitemap and a short address of its own, without a second page having to
 * exist for it.
 */
export type PublicSearchPresetId =
  'all' | 'projects' | 'events' | 'showcase' | 'cv';

export interface PublicSearchPreset {
  id: PublicSearchPresetId;
  /**
   * A short address that redirects to this configuration. The configuration
   * itself stays canonical, so the short address is a door, not a second page.
   */
  path?: string;
  filters: Pick<PublicSearchFilters, 'type' | 'showcase' | 'cv'>;
}

export const PUBLIC_SEARCH_PRESETS: PublicSearchPreset[] = [
  { id: 'all', filters: { showcase: false, cv: false } },
  {
    id: 'projects',
    path: '/projects/',
    filters: { type: 'project', showcase: false, cv: false },
  },
  {
    id: 'events',
    path: '/events/',
    filters: { type: 'event', showcase: false, cv: false },
  },
  {
    id: 'showcase',
    path: '/showcase/',
    filters: { type: 'project', showcase: true, cv: false },
  },
  {
    id: 'cv',
    path: '/cv/',
    filters: { type: 'project', showcase: false, cv: true },
  },
];

/**
 * Which preset a set of filters is, if any. A text query, a tag or a page
 * beyond the first makes it an ordinary search again: those results change
 * with the library and have no business in an index.
 */
export function publicSearchPreset(
  filters: PublicSearchFilters,
  page = 1,
): PublicSearchPreset | undefined {
  if (filters.q.trim() || filters.tags.length || filters.exclude.length)
    return undefined;
  if (page > 1) return undefined;
  return PUBLIC_SEARCH_PRESETS.find(
    (preset) =>
      preset.filters.type === filters.type &&
      preset.filters.showcase === filters.showcase &&
      preset.filters.cv === filters.cv,
  );
}

/** The canonical address of a preset: the search page with its filters. */
export function publicSearchPresetHref(preset: PublicSearchPreset): string {
  const query = publicSearchQuery({
    q: '',
    tags: [],
    exclude: [],
    ...preset.filters,
  });
  const search = new URLSearchParams(query).toString();
  return search ? `/search/?${search}` : '/search/';
}
