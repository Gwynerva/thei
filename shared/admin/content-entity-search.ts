import type { ContentEntityType } from '../content-link';
import type { MediaDescriptor } from '../media';

export type ContentEntitySearchItem = {
  entityType: ContentEntityType;
  entityId: string;
  title: string;
  summary: string;
  url: string;
  humanReadableSlug: string;
  publicId?: string;
  /** The day of a diary entry, which stands in for its missing title. */
  date?: string;
  /** The project a stage or a section belongs to. */
  parent?: { title: string; href: string };
  updatedAt: number;
  previewMedia?: MediaDescriptor;
};

/**
 * What a picker needs to show an entity as its choice: a search result, or
 * the target of a link being edited, described by the link resolver.
 */
export type ContentEntityChoice = Pick<
  ContentEntitySearchItem,
  'entityType' | 'entityId' | 'title' | 'summary' | 'date' | 'parent'
> & { previewMedia?: MediaDescriptor };

/** How many results a picker shows unless it asks for more. */
export const CONTENT_ENTITY_SEARCH_LIMIT = 5;
/** The most a picker may ask for. */
export const CONTENT_ENTITY_SEARCH_MAX_LIMIT = 20;

type Rankable = {
  title: string;
  humanReadableSlug: string;
  publicId?: string;
  date?: string;
  updatedAt: number;
};

export function rankContentEntities<T extends Rankable>(
  items: T[],
  query: string,
  limit = CONTENT_ENTITY_SEARCH_LIMIT,
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized)
    return [...items]
      .sort(
        (a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title),
      )
      .slice(0, limit);
  const day = normalizeDayQuery(normalized);
  return items
    .map((item) => ({ item, rank: bestRank(item, normalized, day) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((a, b) => a.rank - b.rank || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map(({ item }) => item);
}

function bestRank(item: Rankable, query: string, day?: string) {
  // A diary entry has no name to search by, only its day, which a person
  // types either way round: `2024.05.12` or `12.05.2024`.
  const fields = item.date
    ? day
      ? [item.date, dayFirst(item.date)]
      : []
    : [item.title, item.publicId, item.humanReadableSlug];
  const needle = item.date ? day! : query;
  let best = Number.POSITIVE_INFINITY;
  fields
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLocaleLowerCase())
    .forEach((value, index) => {
      const rank =
        value === needle
          ? 0
          : value.startsWith(needle)
            ? 1
            : value.includes(needle)
              ? 2
              : 3;
      if (rank < 3) best = Math.min(best, index * 10 + rank);
    });
  return best;
}

/**
 * A query that looks like a day or part of one, with its separators made
 * `-` and one-digit parts padded — `5.3.2024` becomes `05-03-2024` — so it
 * compares with an entry's day in either order. Anything else is not a day.
 */
export function normalizeDayQuery(query: string): string | undefined {
  if (!/^\d{1,4}(?:[.\-/ ]\d{1,4}){0,2}[.\-/ ]?$/.test(query)) return undefined;
  const parts = query.split(/[.\-/ ]/).filter(Boolean);
  const complete = parts.length === 3;
  return (
    parts
      .map((part, index) =>
        part.length === 1 && (complete || index < parts.length - 1)
          ? `0${part}`
          : part,
      )
      .join('-') + (/[.\-/ ]$/.test(query) ? '-' : '')
  );
}

/** `2024-05-12` → `12-05-2024`. */
function dayFirst(date: string) {
  return date.split('-').reverse().join('-');
}
