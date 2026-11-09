import {
  collectContentAssetUuids,
  createEmptyContentFieldValue,
  isContentEmpty,
  normalizeContentData,
  type ContentFieldModelValue,
} from './content';
import { optionalContentDraftRef } from './content-history';
import type { MediaDescriptor } from './media';
import { normalizeHeadingText } from './terminal-punctuation';
import {
  normalizeHumanReadableSlug,
  normalizePublicId,
  publicIdIsValid,
} from './public-link';
import {
  RELATION_TARGET_TYPES,
  validateRelations,
  type RelationEditItem,
  type RelationGetItem,
} from './relation';

/**
 * An excerpt is a section written where the day was: a named part of a diary
 * entry, an event or a project, about something in the archive. It has a
 * title, a text and at least one relation — a project, an event or an entry
 * it is about — and may have a summary, a banner and the owner's privacy. It
 * is read in full on its parent's page, on a page of its own, and as a card
 * on the pages of what it relates to.
 *
 * It is not an entity of the ladder: a day stays a date and a text, and an
 * excerpt is what the owner names in it. Nor does it stand alone: what is
 * about nothing in the archive is a heading in the day's text, not an
 * excerpt.
 */
export const EXCERPT_PARENT_TYPES = [
  'diary-entry',
  'event',
  'project',
] as const;
export type ExcerptParentType = (typeof EXCERPT_PARENT_TYPES)[number];

export function isExcerptParentType(
  value: unknown,
): value is ExcerptParentType {
  return EXCERPT_PARENT_TYPES.includes(value as ExcerptParentType);
}

/** An excerpt as its parent's form holds and saves it. */
export interface ExcerptItem {
  excerptUuid?: string;
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  isPrivate: boolean;
  /** Never empty: an excerpt is its text. */
  content: ContentFieldModelValue;
  /** What it is about: at least one project, event or diary entry. */
  relations: RelationEditItem[];
  /** The picture the excerpt's page opens with and its cards show. */
  bannerAssetUuid?: string;
  /** How the form shows that banner; the server never reads it. */
  bannerMedia?: MediaDescriptor;
}

/** An excerpt as the form reads it back: stored, its relations described. */
export type ExcerptValue = Omit<ExcerptItem, 'relations'> & {
  excerptUuid: string;
  relations: RelationGetItem[];
};

export class ExcerptError extends Error {}

/**
 * How many more times each file is placed in a list of excerpts than in the
 * list as last saved — a banner, the files of a text — so the picker counts
 * a file's uses with an excerpt still unsaved.
 */
export function excerptsAssetUsageDelta(
  current: readonly ExcerptItem[],
  saved: readonly ExcerptItem[],
): Record<string, number> {
  const count = (items: readonly ExcerptItem[]) => {
    const counts: Record<string, number> = {};
    const add = (assetUuid: string | undefined) => {
      if (!assetUuid) return;
      counts[assetUuid] = (counts[assetUuid] ?? 0) + 1;
    };
    for (const item of items) {
      add(item.bannerAssetUuid);
      collectContentAssetUuids(item.content?.data).forEach(add);
    }
    return counts;
  };
  const currentCounts = count(current);
  const savedCounts = count(saved);
  const assetUuids = new Set([
    ...Object.keys(currentCounts),
    ...Object.keys(savedCounts),
  ]);
  return Object.fromEntries(
    Array.from(assetUuids, (assetUuid) => [
      assetUuid,
      (currentCounts[assetUuid] ?? 0) - (savedCounts[assetUuid] ?? 0),
    ]).filter(([, delta]) => delta !== 0),
  );
}

export function normalizeExcerpts(value: unknown): ExcerptItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ExcerptError('Invalid excerpts');
  return value.map(normalizeExcerpt);
}

function optionalId(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id || undefined;
}

export function normalizeExcerpt(value: unknown): ExcerptItem {
  if (!value || typeof value !== 'object')
    throw new ExcerptError('Invalid excerpt');
  const source = value as Record<string, unknown>;
  const title =
    typeof source.title === 'string'
      ? normalizeHeadingText(source.title.trim())
      : '';
  if (!title) throw new ExcerptError('Excerpt title cannot be empty');
  if (typeof source.isPrivate !== 'boolean')
    throw new ExcerptError('Invalid excerpt privacy');
  const contentSource =
    source.content && typeof source.content === 'object'
      ? (source.content as Record<string, unknown>)
      : undefined;
  const content: ContentFieldModelValue = contentSource
    ? {
        contentUuid: optionalId(contentSource.contentUuid),
        data: normalizeContentData(contentSource.data),
        ...(typeof contentSource.updatedAt === 'number'
          ? { updatedAt: contentSource.updatedAt }
          : {}),
        ...optionalContentDraftRef(contentSource.draftRef),
      }
    : createEmptyContentFieldValue();
  if (isContentEmpty(content.data))
    throw new ExcerptError('An excerpt needs a text');
  const relations =
    validateRelations(source.relations as RelationEditItem[] | undefined, {
      allowed: RELATION_TARGET_TYPES,
    }) ?? [];
  if (!relations.length)
    throw new ExcerptError(
      'An excerpt says what it is about: relate it to a project, an event or a diary entry',
    );
  const publicId = normalizePublicId(source.publicId);
  if (!publicIdIsValid(publicId)) throw new ExcerptError('Invalid public ID');
  return {
    excerptUuid: optionalId(source.excerptUuid),
    title,
    summary: typeof source.summary === 'string' ? source.summary.trim() : '',
    humanReadableSlug: normalizeHumanReadableSlug(source.humanReadableSlug),
    publicId,
    isPrivate: source.isPrivate,
    content,
    relations,
    ...(typeof source.bannerAssetUuid === 'string' && source.bannerAssetUuid
      ? { bannerAssetUuid: source.bannerAssetUuid }
      : {}),
  };
}
