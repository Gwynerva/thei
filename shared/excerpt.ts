import { ProjectEventAccessLevel } from './access-level';
import {
  collectContentAssetUuids,
  isContentEmpty,
  type ContentFieldModelValue,
} from './content';
import type { MediaDescriptor } from './media';
import {
  normalizeContentItemFields,
  normalizeContentItemId,
} from './project-content-item';
import {
  RELATION_TARGET_TYPES,
  validateRelations,
  type RelationEditItem,
  type RelationGetItem,
} from './relation';

/**
 * An excerpt is a section written where the day was: a named part of a diary
 * entry, an event or a project, about one thing in the archive. It has a
 * title, a text and one relation — the project, the event or the entry it is
 * about — and may have a summary, a banner and the owner's privacy. It is
 * read in full on its parent's page, on a page of its own, and as a card on
 * the page of what it is about. Should that be deleted and the excerpt kept,
 * it is about nothing until the owner says what it is about again.
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
  /**
   * What it is about: one project, event or diary entry, as a relation with
   * the excerpt on one end. Nothing only once what it was about is deleted
   * and the excerpt kept; its own form asks for one again.
   */
  about: RelationEditItem | null;
  /** The picture the excerpt's page opens with and its cards show. */
  bannerAssetUuid?: string;
  /** How the form shows that banner; the server never reads it. */
  bannerMedia?: MediaDescriptor;
}

/** An excerpt as the form reads it back: stored, what it is about described. */
export type ExcerptValue = Omit<ExcerptItem, 'about'> & {
  excerptUuid: string;
  about: RelationGetItem | null;
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

/** An excerpt as it is saved: a section's fields, its text needed, and what it is about. */
export function normalizeExcerpt(value: unknown): ExcerptItem {
  if (!value || typeof value !== 'object')
    throw new ExcerptError('Invalid excerpt');
  const source = value as Record<string, unknown>;
  const { content, bannerAssetUuid, ...named } = normalizeContentItemFields(
    source,
    { name: 'excerpt', error: ExcerptError },
  );
  if (isContentEmpty(content.data))
    throw new ExcerptError('An excerpt needs a text');
  return {
    excerptUuid: normalizeContentItemId(source.excerptUuid),
    ...named,
    content,
    about: normalizeExcerptAbout(source.about),
    ...(bannerAssetUuid ? { bannerAssetUuid } : {}),
  };
}

/**
 * How far what an excerpt is about closes it beyond its own switch and its
 * parent: `Private` while the subject is private, `LinkOnly` while it is
 * open by its link only — then the excerpt is listed nowhere but on the
 * subject's page — and nothing while it is public or gone. The one reading
 * of it for the sitemap, the form's words and the row's lock; who may see
 * an excerpt is `server/thei/excerpts/parents.ts`'s, which reads it too.
 */
export function excerptSubjectLimit(
  subjectAccess: ProjectEventAccessLevel | undefined,
):
  | ProjectEventAccessLevel.Private
  | ProjectEventAccessLevel.LinkOnly
  | undefined {
  return subjectAccess === ProjectEventAccessLevel.Private ||
    subjectAccess === ProjectEventAccessLevel.LinkOnly
    ? subjectAccess
    : undefined;
}

/**
 * What an excerpt is about, as it is saved: one project, event or diary
 * entry, or nothing — never two. Nothing is kept for an excerpt whose
 * subject was deleted, so its parent's form still saves; the excerpt's own
 * form asks for one before it saves the excerpt, and the server takes
 * nothing for a new excerpt or one about something (`prepareExcerpts`).
 */
export function normalizeExcerptAbout(value: unknown): RelationEditItem | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value))
    throw new ExcerptError('An excerpt is about one thing, not a list');
  const [about] =
    validateRelations([value as RelationEditItem], {
      allowed: RELATION_TARGET_TYPES,
    }) ?? [];
  return about ?? null;
}
