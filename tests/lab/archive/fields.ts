// Where each field of Thei's forms comes from in the archive. A field of a
// form that is neither here nor among the exceptions fails
// `contract.test.ts`: a new field of an entity comes with its place in the
// format, or with the reason it has none.

/** Form field (as `FORM_FIELDS` names it) → what FORMAT.md writes it as. */
export const FIELD_MAP: Record<string, Record<string, string>> = {
  project: {
    title: 'title',
    summary: 'summary',
    access: 'access',
    showcase: 'featured',
    cv: 'cv',
    reminder: 'reminder',
    synonyms: 'synonyms',
    slug: 'slug (derived from the title when absent)',
    publicId: 'derived from the ref',
    icon: 'icon',
    banner: 'banner',
    showcaseFiles: 'showcase',
    files: 'files',
    links: 'links',
    tags: 'tags',
    relations: 'relations',
    description: 'the body',
    notes: 'notes',
    sections: 'sections/<NN>-<id>.md',
    sectionOrder: 'the NN of the section files',
    statuses: 'statuses',
    actionText: 'action.text',
  },
  'project-section': {
    title: 'title',
    summary: 'summary',
    private: 'private',
    periods: 'periods',
    body: 'the body',
    banner: 'banner',
    slug: 'slug (derived from the title when absent)',
    publicId: 'derived from the ref',
  },
  event: {
    title: 'title',
    summary: 'summary',
    access: 'access',
    reminder: 'reminder',
    synonyms: 'synonyms',
    slug: 'slug (derived from the title when absent)',
    publicId: 'derived from the ref',
    periods: 'periods',
    banner: 'banner',
    files: 'files',
    links: 'links',
    tags: 'tags',
    relations: 'relations',
    body: 'the body',
    notes: 'notes',
  },
  'diary-entry': {
    date: 'the file name',
    access: 'access',
    reminder: 'reminder',
    body: 'the body',
    notes: 'notes',
    relations: 'relations',
  },
  page: {
    title: 'title',
    summary: 'summary',
    access: 'access',
    reminder: 'reminder',
    synonyms: 'synonyms',
    slug: 'slug (the id when absent)',
    icon: 'icon',
    body: 'the body',
    notes: 'notes',
  },
  tag: {
    title: 'title',
    description: 'the body',
    synonyms: 'synonyms',
    slug: 'slug',
    publicId: 'derived from the ref',
    icon: 'icon',
  },
  profile: {
    displayName: 'name',
    slogan: 'slogan',
    nickname: 'nickname',
    about: 'the body',
    banner: 'banner',
    favicon: 'favicon',
    links: 'links',
    statuses: 'statuses',
  },
};

/** Form fields the format leaves out, and why. */
export const NOT_IN_FORMAT: Record<string, Record<string, string>> = {};

/**
 * What Thei keeps of a file beyond the file itself that the format cannot
 * say, and why. These are seeded as Thei makes them on its own, and a
 * scenario cannot pick a file by them.
 */
export const FILE_PROPERTIES_NOT_IN_FORMAT: Record<string, string> = {
  still:
    "A video's chosen still (its preview frame): the owner chooses it by eye among the frames, and it has no AI action (AGENTS.md). " +
    'Seeded videos keep the frame Thei picks itself; seeding a chosen one needs a format revision of Gwynerva/thei-lab-archive.',
};

/**
 * Keys of a form that are drawn from others for the form to show — a
 * file's media and size, the action button's own fields — and neither
 * written nor kept by name.
 */
export type DerivedFormKey =
  `${string}Media` | `${string}Size` | `action${string}`;

export function isDerivedFormKey(key: string): boolean {
  return (
    key.endsWith('Media') || key.endsWith('Size') || key.startsWith('action')
  );
}

/**
 * Keys of the admin's forms as the routes read them back, which the seeder
 * either writes from the archive or keeps as the site has them. A key the
 * seeder meets and finds in neither is reported, so a new field is noticed;
 * `fields.test-d.ts` holds them against the forms' types before any seeding.
 */
const FORM_KEY_LISTS = {
  project: {
    written: [
      'title',
      'summary',
      'humanReadableSlug',
      'publicId',
      'access',
      'showcase',
      'cv',
      'iconAssetUuid',
      'bannerAssetUuid',
      'descriptionContent',
      'sections',
      'showcaseAssets',
      'otherAssets',
      'relations',
      'externalLinks',
      'tags',
      'action',
      'reminder',
      'synonyms',
      'notes',
      'newStatuses',
      'updatedStatuses',
      'deletedStatusIds',
    ],
    kept: [
      'projectUuid',
      'version',
      'statuses',
      'iconMedia',
      'bannerMedia',
      'createdAt',
      'updatedAt',
    ],
  },
  event: {
    written: [
      'title',
      'summary',
      'access',
      'humanReadableSlug',
      'publicId',
      'periods',
      'content',
      'bannerAssetUuid',
      'otherAssets',
      'externalLinks',
      'tags',
      'relations',
      'action',
      'reminder',
      'synonyms',
      'notes',
    ],
    kept: ['eventUuid', 'version', 'bannerMedia', 'createdAt', 'updatedAt'],
  },
  diary: {
    written: ['date', 'access', 'content', 'relations', 'reminder', 'notes'],
    kept: ['diaryUuid', 'version', 'createdAt', 'updatedAt'],
  },
  page: {
    written: [
      'title',
      'summary',
      'slug',
      'access',
      'iconAssetUuid',
      'content',
      'reminder',
      'synonyms',
      'notes',
    ],
    kept: ['pageUuid', 'version', 'iconMedia', 'createdAt', 'updatedAt'],
  },
  tag: {
    written: [
      'title',
      'slug',
      'publicId',
      'description',
      'synonyms',
      'iconAssetUuid',
    ],
    kept: ['tagUuid', 'version', 'iconMedia', 'usageStats'],
  },
  profile: {
    written: [
      'displayName',
      'slogan',
      'nickname',
      'birthDate',
      'avatarAssetUuid',
      'avatarChangeId',
      'bannerAssetUuid',
      'faviconAssetUuid',
      'aboutContent',
      'facts',
      'pinnedPageUuids',
      'externalLinks',
      'newStatuses',
      'updatedStatuses',
      'deletedStatusIds',
    ],
    kept: ['version', 'deletedAvatarIds'],
  },
} as const;

export type FormKeyKind = keyof typeof FORM_KEY_LISTS;

/** The keys a form of this kind is known by: written or kept. */
export type KnownFormKey<Kind extends FormKeyKind> =
  | (typeof FORM_KEY_LISTS)[Kind]['written'][number]
  | (typeof FORM_KEY_LISTS)[Kind]['kept'][number];

export const FORM_KEYS: Record<
  string,
  { written: readonly string[]; kept: readonly string[] }
> = FORM_KEY_LISTS;
