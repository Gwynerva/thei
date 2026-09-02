import type { ContentEntityType } from '../content-link';
import type { MediaDescriptor } from '../media';
import type { TagItem } from '../tag';

export type ContentEntitySearchItem = {
  entityType: ContentEntityType;
  entityId: string;
  title: string;
  summary: string;
  url: string;
  humanReadableSlug: string;
  publicId?: string;
  updatedAt: number;
  previewMedia?: MediaDescriptor;
  tags?: TagItem[];
};

export function rankContentEntities(
  items: ContentEntitySearchItem[],
  query: string,
  limit = 8,
) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized)
    return [...items]
      .sort(
        (a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title),
      )
      .slice(0, limit);
  return items
    .map((item) => ({ item, rank: bestRank(item, normalized) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((a, b) => a.rank - b.rank || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map(({ item }) => item);
}

function bestRank(item: ContentEntitySearchItem, query: string) {
  const fields = [item.title, item.publicId, item.humanReadableSlug]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLocaleLowerCase());
  let best = Number.POSITIVE_INFINITY;
  fields.forEach((value, index) => {
    const rank =
      value === query
        ? 0
        : value.startsWith(query)
          ? 1
          : value.includes(query)
            ? 2
            : 3;
    if (rank < 3) best = Math.min(best, index * 10 + rank);
  });
  return best;
}
