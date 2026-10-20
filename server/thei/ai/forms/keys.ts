import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import type { ProjectSectionItem } from '#layers/thei/shared/project-content-item';
import type { EventEditData } from '#layers/thei/shared/event';
import type { DiaryEditData } from '#layers/thei/shared/diary';
import type { PageEditData } from '#layers/thei/shared/page';
import type { TagEditData } from '#layers/thei/shared/tag';
import type { ProfileEditData } from '#layers/thei/shared/profile';
import type { FORM_FIELDS, FormKind } from './changes';

/** Status lines as a form is read with them (`./load`): their words by id. */
type StatusTexts = { statusTexts?: Record<string, string> };

/** Each kind's form, as `loadForm` reads it and its save takes it. */
type Forms = {
  project: ProjectEditData & StatusTexts;
  'project-section': ProjectSectionItem;
  event: EventEditData;
  'diary-entry': DiaryEditData;
  page: PageEditData;
  tag: TagEditData;
  profile: ProfileEditData & StatusTexts & { statuses?: unknown };
};

type FieldOf<K extends FormKind> = (typeof FORM_FIELDS)[K][number];

/**
 * Every key of each kind's form, by the field of FORM_FIELDS a change of it
 * names — or null, for a key no change proposes, with why. A key a form
 * gains fails the type check here until it is named, so a new field of an
 * entity never goes without its change by oversight
 * (`tests/server/ai-actions-contract.test.ts` holds FORM_FIELDS to it).
 */
export const FORM_KEYS = {
  project: {
    title: 'title',
    summary: 'summary',
    humanReadableSlug: 'slug',
    publicId: 'publicId',
    access: 'access',
    showcase: 'showcase',
    cv: 'cv',
    iconAssetUuid: 'icon',
    bannerAssetUuid: 'banner',
    descriptionContent: 'description',
    // Its sections, changed or put in another order.
    sections: ['sections', 'sectionOrder'],
    showcaseAssets: 'showcaseFiles',
    otherAssets: 'files',
    relations: 'relations',
    externalLinks: 'links',
    tags: 'tags',
    // Its button: a change proposes the words on it.
    action: 'actionText',
    reminder: 'reminder',
    synonyms: 'synonyms',
    notes: 'notes',
    // The version the form was read at, which a save is checked against.
    version: null,
    // What a save writes of status lines: a change rewrites their words.
    newStatuses: null,
    updatedStatuses: null,
    deletedStatusIds: null,
    statusTexts: 'statuses',
  },
  'project-section': {
    // Its id, by which a change of it is merged.
    sectionUuid: null,
    title: 'title',
    summary: 'summary',
    humanReadableSlug: 'slug',
    publicId: 'publicId',
    isPrivate: 'private',
    periods: 'periods',
    content: 'body',
    bannerAssetUuid: 'banner',
    // How the form shows its banner; no save reads it.
    bannerMedia: null,
  },
  event: {
    title: 'title',
    summary: 'summary',
    access: 'access',
    humanReadableSlug: 'slug',
    publicId: 'publicId',
    periods: 'periods',
    content: 'body',
    bannerAssetUuid: 'banner',
    otherAssets: 'files',
    externalLinks: 'links',
    tags: 'tags',
    relations: 'relations',
    // Its button: no change proposes it, unlike a project's words on one.
    action: null,
    reminder: 'reminder',
    synonyms: 'synonyms',
    notes: 'notes',
    version: null,
  },
  'diary-entry': {
    date: 'date',
    access: 'access',
    content: 'body',
    relations: 'relations',
    reminder: 'reminder',
    notes: 'notes',
    version: null,
  },
  page: {
    title: 'title',
    summary: 'summary',
    slug: 'slug',
    access: 'access',
    iconAssetUuid: 'icon',
    content: 'body',
    reminder: 'reminder',
    synonyms: 'synonyms',
    notes: 'notes',
    version: null,
  },
  tag: {
    title: 'title',
    slug: 'slug',
    publicId: 'publicId',
    description: 'description',
    synonyms: 'synonyms',
    iconAssetUuid: 'icon',
    version: null,
  },
  profile: {
    displayName: 'displayName',
    slogan: 'slogan',
    nickname: 'nickname',
    // No change proposes the birthday, the avatar and its history, the
    // facts or the pinned pages.
    birthDate: null,
    avatarAssetUuid: null,
    avatarChangeId: null,
    deletedAvatarIds: null,
    facts: null,
    pinnedPageUuids: null,
    bannerAssetUuid: 'banner',
    faviconAssetUuid: 'favicon',
    aboutContent: 'about',
    externalLinks: 'links',
    version: null,
    newStatuses: null,
    updatedStatuses: null,
    deletedStatusIds: null,
    // Read with the form for a model to name them by id; never saved.
    statuses: null,
    statusTexts: 'statuses',
  },
} satisfies {
  [K in FormKind]: {
    [Key in keyof Forms[K]]-?: FieldOf<K> | readonly FieldOf<K>[] | null;
  };
};

/**
 * The field a change of a form's key names it by — `externalLinks` is
 * `links` — or the key itself, for one no change proposes.
 */
export function fieldOfKey(kind: FormKind, key: string): string {
  const named = (FORM_KEYS[kind] as Record<string, unknown>)[key];
  if (typeof named === 'string') return named;
  return Array.isArray(named) ? String(named[0]) : key;
}

/**
 * The fields of a form, as its keys are kept in what an update changes, by
 * the names a change gives them: what a card of it says.
 */
export function fieldNamesOf(
  kind: string,
  keys: readonly string[],
): Record<string, string> | undefined {
  if (!(kind in FORM_KEYS)) return undefined;
  return Object.fromEntries(
    keys.map((key) => [key, fieldOfKey(kind as FormKind, key)]),
  );
}
