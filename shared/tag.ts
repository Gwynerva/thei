import type { MediaDescriptor } from './media';
import { normalizePublicId, publicIdIsValid } from './public-link';
import { normalizeUrlSegment } from './language/slugify';
import type { ImageAccent } from './accent-color';
import { imageAccentCssColor } from './accent-color';
import { stringColorHue } from './utils/string-color';
import { identityKey } from './identity-key';
import {
  keyTier,
  NAME_RANKS,
  nameTier,
  prepareNameQuery,
  type NameQuery,
  type NameTier,
} from './search/match';
import {
  normalizeSynonyms,
  SYNONYM_LIMIT,
  SYNONYM_SEPARATOR,
} from './synonyms';

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
  /** The version the form was read at; a save over a newer one is refused. */
  version?: number;
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
  'title-taken' | 'slug-taken' | 'public-id-taken' | 'name-taken' | 'changed';

export type TagSaveResponse =
  | {
      type: 'success';
      tagUuid: string;
      /** The version the saved form is at, to send with the next save. */
      version: number;
    }
  | {
      type: 'error';
      message: string;
      code?: TagSaveErrorCode;
    };

export const TAG_TITLE_MAX_LENGTH = 100;

/** How many matches the tag picker asks for and shows. */
export const TAG_SEARCH_LIMIT = 5;

/** More than this is a description, not a list of names. */
export const TAG_SYNONYM_LIMIT = SYNONYM_LIMIT;

/** What separates synonyms typed or pasted as one line. */
export const TAG_SYNONYM_SEPARATOR = SYNONYM_SEPARATOR;

/**
 * A tag's identity: its title without case, compatibility forms or the
 * difference between «ё» and «е». Two titles that normalize alike name one
 * tag. Stored as `tags.normalizedTitle`, so it is an identity key.
 */
export function normalizeTagTitle(value: string): string {
  return identityKey(value.trim());
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
  return normalizeSynonyms(value, title, {
    tooLong: 'Tag synonym is too long',
    tooMany: 'Too many tag synonyms',
  });
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
 * Tags matching what is typed, best first, as a picker ranks entities: the
 * title found whole, by its start, by its words in the order typed or in any
 * order, or inside it from a word's start — «косплея» finds «Косплей»; then a
 * synonym, one typed word for word right after a title typed word for word
 * (`NAME_RANKS`); then the public ID and the slug by any part of them.
 */
export function rankTagSearch<T extends SearchableTag>(
  tags: T[],
  query: string,
  limit = TAG_SEARCH_LIMIT,
): T[] {
  const prepared = prepareNameQuery(cleanTagTitle(query));
  if (!prepared.key) return tags.slice(0, limit);
  return tags
    .map((tag) => ({ tag, score: tagSearchScore(tag, prepared) }))
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
  const prepared = prepareNameQuery(cleanTagTitle(query));
  if (!prepared.key || nameTier(prepared, tag.title)) return undefined;
  return synonymMatch(tag, prepared)?.synonym;
}

const ID_RANKS = { exact: 0, start: 1, inside: 2 };

function tagSearchScore(tag: SearchableTag, query: NameQuery) {
  let best = Number.POSITIVE_INFINITY;
  const title = nameTier(query, tag.title);
  if (title) best = NAME_RANKS.title[title];
  const synonym = synonymMatch(tag, query);
  if (synonym) best = Math.min(best, NAME_RANKS.synonym[synonym.tier]);
  const publicId = keyTier(query, tag.publicId);
  if (publicId) best = Math.min(best, 10 + ID_RANKS[publicId]);
  const slug = keyTier(query, tag.slug);
  if (slug) best = Math.min(best, 20 + ID_RANKS[slug]);
  return best;
}

function synonymMatch(tag: SearchableTag, query: NameQuery) {
  let best: { synonym: string; tier: NameTier } | undefined;
  for (const synonym of tag.synonyms ?? []) {
    const tier = nameTier(query, synonym);
    if (
      tier &&
      (!best || NAME_RANKS.synonym[tier] < NAME_RANKS.synonym[best.tier])
    )
      best = { synonym, tier };
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
