import type { MediaDescriptor } from './media';
import { normalizePublicId, publicIdIsValid } from './public-link';
import { normalizeUrlSegment } from './language/slugify';
import type { ImageAccent } from './accent-color';
import { imageAccentCssColor } from './accent-color';
import { stringColorHue } from './utils/string-color';

export const TAG_CONTAINER_TYPES = ['project', 'event'] as const;
export type TagContainerType = (typeof TAG_CONTAINER_TYPES)[number];

export type TagItem = {
  tagUuid: string;
  title: string;
  slug: string;
  publicId: string;
  description?: string;
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
  iconAssetUuid?: string;
};

export type TagUsageStats = {
  total: number;
  projects: number;
  events: number;
};

export type TagSaveErrorCode = 'title-taken' | 'slug-taken' | 'public-id-taken';

export type TagSaveResponse =
  | { type: 'success'; tagUuid: string }
  | {
      type: 'error';
      message: string;
      code?: TagSaveErrorCode;
    };

export const TAG_TITLE_MAX_LENGTH = 100;

/** How many matches the tag picker asks for and shows. */
export const TAG_SEARCH_LIMIT = 5;

export function normalizeTagTitle(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase();
}

/**
 * A tag title as it is stored: trimmed, with every run of whitespace inside
 * it collapsed to one space, so "Product  design" cannot become a tag of its
 * own beside "Product design".
 */
export function cleanTagTitle(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

/**
 * The tags of a project or an event, cleaned for saving. Two items naming one
 * tag — by title or by identity — are refused rather than silently merged, so
 * the list the person sees is the list that is stored.
 */
export function normalizeTagEditItems(
  tags: TagEditItem[] | undefined,
  fail: (message: string) => never,
): TagEditItem[] | undefined {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) fail('Invalid tags');
  const titles = new Set<string>();
  const tagUuids = new Set<string>();
  return tags.map((tag) => {
    if (!tag || typeof tag !== 'object') fail('Invalid tags');
    const title = typeof tag.title === 'string' ? cleanTagTitle(tag.title) : '';
    if (!title) fail('Tag title cannot be empty');
    if (title.length > TAG_TITLE_MAX_LENGTH) fail('Tag title is too long');
    const identity = normalizeTagTitle(title);
    if (titles.has(identity)) fail('Duplicate tag');
    titles.add(identity);
    if (typeof tag.tagUuid !== 'string' || !tag.tagUuid) return { title };
    if (tagUuids.has(tag.tagUuid)) fail('Duplicate tag');
    tagUuids.add(tag.tagUuid);
    return { ...tag, title };
  });
}

export function validateTagData(data: unknown): string | TagEditData {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return 'Invalid tag data';
  const item = data as Partial<Record<keyof TagEditData, unknown>>;
  const title = typeof item.title === 'string' ? cleanTagTitle(item.title) : '';
  if (!title) return 'Tag title cannot be empty';
  if (title.length > TAG_TITLE_MAX_LENGTH) return 'Tag title is too long';
  const slug = normalizeUrlSegment(item.slug);
  if (!slug) return 'Tag slug cannot be empty';
  if (slug.length > 100) return 'Tag slug is too long';
  const publicId = normalizePublicId(item.publicId);
  if (!publicIdIsValid(publicId)) return 'Invalid public ID';
  const description =
    typeof item.description === 'string' ? item.description.trim() : '';
  if (description.length > 2_000) return 'Tag description is too long';
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
    iconAssetUuid,
  };
}

export function rankTagSearch<
  T extends Pick<TagItem, 'title' | 'publicId' | 'slug'>,
>(tags: T[], query: string, limit = TAG_SEARCH_LIMIT): T[] {
  const needle = normalizeTagTitle(cleanTagTitle(query));
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

/**
 * A tag's accent, derived the way every other entity derives one.
 *
 * Its icon supplies the colour when there is an icon; otherwise the title does,
 * through the same hash the generated icons use. Nothing is stored, so a tag
 * can never drift out of step with the projects and events carrying it.
 */
export function tagAccent(tag: {
  title: string;
  iconMedia?: { accent?: ImageAccent };
}): ImageAccent {
  return (
    tag.iconMedia?.accent ?? { hue: stringColorHue(tag.title), chroma: 0.15 }
  );
}

export function tagAccentCssColor(
  tag: { title: string; iconMedia?: { accent?: ImageAccent } },
  alpha?: number,
) {
  return imageAccentCssColor(tagAccent(tag), 'var(--color-text-3)', alpha);
}
