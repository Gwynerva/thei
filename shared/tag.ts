import type { MediaDescriptor } from './media';

export const TAG_CONTAINER_TYPES = ['project', 'event'] as const;
export type TagContainerType = (typeof TAG_CONTAINER_TYPES)[number];

export type TagItem = {
  tagUuid: string;
  title: string;
  slug: string;
  publicId: string;
  description?: string;
  accentColor?: string;
  iconAssetUuid?: string;
  iconMedia?: MediaDescriptor;
  iconAssetSize?: number;
};

export type TagEditItem =
  | TagItem
  | {
      tagUuid?: undefined;
      title: string;
    };

export type TagListItem = TagItem & {
  usageCounts: Partial<Record<TagContainerType, number>>;
};

export type TagEditData = {
  title: string;
  slug: string;
  publicId: string;
  description: string;
  accentColor?: string;
  iconAssetUuid?: string;
};

export type TagUsageStats = {
  total: number;
  projects: number;
  events: number;
};

export type TagSaveErrorCode =
  | 'title-taken'
  | 'slug-taken'
  | 'public-id-taken';

export type TagSaveResponse =
  | { type: 'success'; tagUuid: string }
  | {
      type: 'error';
      message: string;
      code?: TagSaveErrorCode;
    };

export function normalizeTagTitle(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase();
}

export function validateTagData(data: unknown): string | TagEditData {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return 'Invalid tag data';
  const item = data as Partial<Record<keyof TagEditData, unknown>>;
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (!title) return 'Tag title cannot be empty';
  if (title.length > 100) return 'Tag title is too long';
  const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
  if (!slug) return 'Tag slug cannot be empty';
  if (slug.length > 100) return 'Tag slug is too long';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Invalid tag slug';
  const publicId =
    typeof item.publicId === 'string' ? item.publicId.trim() : '';
  if (!publicId || !/^[A-Za-z0-9]{1,64}$/.test(publicId))
    return 'Invalid public ID';
  const description =
    typeof item.description === 'string' ? item.description.trim() : '';
  if (description.length > 2_000) return 'Tag description is too long';
  const accentColor =
    typeof item.accentColor === 'string'
      ? item.accentColor.trim() || undefined
      : undefined;
  if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor))
    return 'Invalid accent color';
  const iconAssetUuid =
    typeof item.iconAssetUuid === 'string'
      ? item.iconAssetUuid.trim() || undefined
      : undefined;
  if (
    iconAssetUuid &&
    !/^a-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      iconAssetUuid,
    )
  )
    return 'Invalid icon asset ID';
  return {
    title,
    slug,
    publicId,
    description,
    accentColor,
    iconAssetUuid,
  };
}

export function rankTagSearch<T extends Pick<TagItem, 'title' | 'publicId' | 'slug'>>(
  tags: T[],
  query: string,
  limit = 8,
): T[] {
  const needle = normalizeTagTitle(query);
  if (!needle) return tags.slice(0, limit);
  return tags
    .map((tag) => ({ tag, score: tagSearchScore(tag, needle) }))
    .filter((item) => item.score < Number.POSITIVE_INFINITY)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.tag.title.localeCompare(b.tag.title, undefined, {
          sensitivity: 'base',
        }),
    )
    .slice(0, limit)
    .map(({ tag }) => tag);
}

export function rankTagRecommendations<
  T extends Pick<TagItem, 'tagUuid' | 'title'>,
>(
  tags: T[],
  text: string,
  coUsage: ReadonlyMap<string, number>,
  limit = 8,
): T[] {
  const normalizedText = normalizeTagTitle(text);
  return tags
    .map((tag) => {
      const title = normalizeTagTitle(tag.title);
      const phrase = normalizedText.includes(title) ? 1 : 0;
      const words = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const matchedWords = words.filter((word) =>
        new RegExp(
          `(^|[^\\p{L}\\p{N}])${escapeTagRegex(word)}([^\\p{L}\\p{N}]|$)`,
          'u',
        ).test(normalizedText),
      ).length;
      const together = coUsage.get(tag.tagUuid) ?? 0;
      if (!phrase && !matchedWords && together < 4) return undefined;
      return { tag, phrase, matchedWords, together };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort(
      (a, b) =>
        b.phrase - a.phrase ||
        b.matchedWords - a.matchedWords ||
        b.together - a.together ||
        a.tag.title.localeCompare(b.tag.title, undefined, {
          sensitivity: 'base',
        }),
    )
    .slice(0, limit)
    .map(({ tag }) => tag);
}

function tagSearchScore(
  tag: Pick<TagItem, 'title' | 'publicId' | 'slug'>,
  needle: string,
) {
  const fields = [tag.title, tag.publicId, tag.slug];
  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
    const value = normalizeTagTitle(fields[fieldIndex]!);
    if (value === needle) return fieldIndex * 10;
    if (value.startsWith(needle)) return fieldIndex * 10 + 1;
    if (value.includes(needle)) return fieldIndex * 10 + 2;
  }
  return Number.POSITIVE_INFINITY;
}

function escapeTagRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
