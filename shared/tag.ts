import type { MediaDescriptor } from './media';
import { normalizePublicId, publicIdIsValid } from './public-link';
import { normalizeUrlSegment } from './language/slugify';
import type { ImageAccent } from './accent-color';
import { imageAccentCssColor } from './accent-color';
import { stringColorHue } from './utils/string-color';
import { normalizeTermText } from './text-terms';

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
  /** Other words the tag is known by. Only the owner sees them. */
  synonyms: string[];
  iconAssetUuid?: string;
};

/** A match of the tag picker's search. */
export type TagSearchItem = TagItem & {
  /** The synonym the query matched, when the title did not. */
  matchedSynonym?: string;
  /** The query is this tag's title or one of its synonyms, word for word. */
  exact?: boolean;
  /**
   * Already on the entity: listed only because the query names it by a
   * synonym, so that the picker does not offer to create it again.
   */
  selected?: boolean;
};

export type TagUsageStats = {
  total: number;
  projects: number;
  events: number;
};

export type TagSaveErrorCode =
  'title-taken' | 'slug-taken' | 'public-id-taken' | 'name-taken';

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

/** More than this is a description, not a list of names. */
export const TAG_SYNONYM_LIMIT = 20;

/** What separates synonyms typed or pasted as one line. */
export const TAG_SYNONYM_SEPARATOR = /[,;\n]/u;

/**
 * A tag's identity: its title without case, compatibility forms or the
 * difference between «ё» and «е». Two titles that normalize alike name one tag.
 */
export function normalizeTagTitle(value: string): string {
  return normalizeTermText(value.trim());
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
  const synonyms = normalizeTagSynonyms(item.synonyms, title);
  if (typeof synonyms === 'string') return synonyms;
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
    synonyms,
    iconAssetUuid,
  };
}

/**
 * The synonyms of a tag as they are stored: cleaned like titles, split where
 * several were typed as one line, each once, and never the title itself.
 * Returns an error message for anything that cannot be a list of words.
 */
export function normalizeTagSynonyms(
  value: unknown,
  title: string,
): string[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return 'Invalid synonyms';
  const seen = new Set([normalizeTagTitle(title)]);
  const synonyms: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return 'Invalid synonyms';
    for (const part of item.split(TAG_SYNONYM_SEPARATOR)) {
      const synonym = cleanTagTitle(part);
      if (!synonym) continue;
      if (synonym.length > TAG_TITLE_MAX_LENGTH)
        return 'Tag synonym is too long';
      const identity = normalizeTagTitle(synonym);
      if (seen.has(identity)) continue;
      seen.add(identity);
      synonyms.push(synonym);
    }
  }
  if (synonyms.length > TAG_SYNONYM_LIMIT) return 'Too many tag synonyms';
  return synonyms;
}

/** Whether a query is a tag's title or one of its synonyms, word for word. */
export function tagNamedBy(
  tag: { title: string; synonyms?: string[] },
  query: string,
): boolean {
  const needle = normalizeTagTitle(cleanTagTitle(query));
  return (
    Boolean(needle) &&
    [tag.title, ...(tag.synonyms ?? [])].some(
      (name) => normalizeTagTitle(name) === needle,
    )
  );
}

type SearchableTag = Pick<TagItem, 'title' | 'publicId' | 'slug'> & {
  synonyms?: string[];
};

/**
 * Tags matching what is typed, best first: the title, then a synonym, then
 * the public ID and the slug. A synonym typed word for word ranks right after
 * a title typed word for word, above titles that merely begin with the query.
 */
export function rankTagSearch<T extends SearchableTag>(
  tags: T[],
  query: string,
  limit = TAG_SEARCH_LIMIT,
): T[] {
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

/** The synonym a query found a tag by, when its title did not match. */
export function matchedTagSynonym(
  tag: SearchableTag,
  query: string,
): string | undefined {
  const needle = normalizeTagTitle(cleanTagTitle(query));
  if (!needle || textMatch(tag.title, needle) !== undefined) return undefined;
  return synonymMatch(tag, needle)?.synonym;
}

function tagSearchScore(tag: SearchableTag, needle: string) {
  const title = textMatch(tag.title, needle);
  if (title !== undefined) return title;
  const synonym = synonymMatch(tag, needle);
  if (synonym) return synonym.score ? 10 + synonym.score : 0.5;
  const publicId = textMatch(tag.publicId, needle);
  if (publicId !== undefined) return 20 + publicId;
  const slug = textMatch(tag.slug, needle);
  if (slug !== undefined) return 30 + slug;
  return Number.POSITIVE_INFINITY;
}

/** 0 for the whole value, 1 for its beginning, 2 for anywhere in it. */
function textMatch(value: string, needle: string) {
  const normalized = normalizeTagTitle(value);
  if (normalized === needle) return 0;
  if (normalized.startsWith(needle)) return 1;
  if (normalized.includes(needle)) return 2;
  return undefined;
}

function synonymMatch(tag: SearchableTag, needle: string) {
  let best: { synonym: string; score: number } | undefined;
  for (const synonym of tag.synonyms ?? []) {
    const score = textMatch(synonym, needle);
    if (score !== undefined && (!best || score < best.score))
      best = { synonym, score };
  }
  return best;
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
