import { eq, inArray } from 'drizzle-orm';
import type { ContentSlot } from '#layers/thei/shared/content';
import { isLifeDay } from '#layers/thei/shared/life';
import { PROFILE_ID } from '#layers/thei/shared/profile';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

/**
 * Every kind of thing on the site that AI sessions, their actions and access
 * over MCP name — in one place: how it is referred
 * to, what it is called, where the owner edits it, when it last changed, the
 * texts it holds and who may see it. A new kind, a moved admin address or a
 * new text changes here and nowhere else.
 *
 * A ref is `kind:id`. A diary entry is referred to by its day, which is what
 * names it everywhere else; its id is accepted on the way in too. The profile
 * is one, and is just `profile`.
 */
export const ENTITY_KINDS = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
  'tag',
  'profile',
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface EntityKey {
  kind: EntityKind;
  /** The stored id: a uuid, or `profile` for the profile. */
  id: string;
  /** A diary entry's day. */
  date?: string;
}

export function isEntityKind(value: unknown): value is EntityKind {
  return (ENTITY_KINDS as readonly unknown[]).includes(value);
}

export function refOf(key: EntityKey): string {
  if (key.kind === 'diary-entry') return `diary-entry:${key.date ?? key.id}`;
  if (key.kind === 'profile') return 'profile';
  return `${key.kind}:${key.id}`;
}

/** A ref taken apart, without asking whether it names anything. */
export function parseRef(
  ref: unknown,
): { kind: EntityKind; id: string } | undefined {
  if (typeof ref !== 'string') return undefined;
  const value = ref.trim();
  if (value === 'profile' || value === 'profile:profile')
    return { kind: 'profile', id: PROFILE_ID };
  const colon = value.indexOf(':');
  if (colon < 0) return undefined;
  const kind = value.slice(0, colon);
  const id = value.slice(colon + 1).trim();
  return isEntityKind(kind) && id && kind !== 'profile'
    ? { kind, id }
    : undefined;
}

/** The id a tag ref names, or the value itself when it is no tag ref. */
export function tagIdOf(ref: string): string {
  return ref.startsWith('tag:') ? ref.slice('tag:'.length) : ref;
}

/** How each kind is stored, as far as naming and dating one goes. */
function tableOf(schema: any, kind: EntityKind) {
  switch (kind) {
    case 'project':
      return {
        table: schema.projects,
        id: schema.projects.projectUuid,
        title: schema.projects.title,
        updatedAt: schema.projects.updatedAt,
      };
    case 'project-section':
      return {
        table: schema.projectContentSections,
        id: schema.projectContentSections.sectionUuid,
        title: schema.projectContentSections.title,
        updatedAt: schema.projectContentSections.updatedAt,
        project: schema.projectContentSections.projectUuid,
        publicId: schema.projectContentSections.publicId,
      };
    case 'event':
      return {
        table: schema.events,
        id: schema.events.eventUuid,
        title: schema.events.title,
        updatedAt: schema.events.updatedAt,
      };
    case 'diary-entry':
      return {
        table: schema.diaryEntries,
        id: schema.diaryEntries.diaryUuid,
        title: schema.diaryEntries.date,
        updatedAt: schema.diaryEntries.updatedAt,
      };
    case 'page':
      return {
        table: schema.pages,
        id: schema.pages.pageUuid,
        title: schema.pages.title,
        updatedAt: schema.pages.updatedAt,
      };
    case 'tag':
      return {
        table: schema.tags,
        id: schema.tags.tagUuid,
        title: schema.tags.title,
        updatedAt: schema.tags.updatedAt,
      };
    case 'profile':
      return {
        table: schema.profiles,
        id: schema.profiles.profileId,
        title: schema.profiles.displayName,
        updatedAt: schema.profiles.updatedAt,
      };
  }
}

/**
 * Where the owner edits an entity: a section, in its project's form, which
 * opens it.
 */
export function adminPath(
  kind: EntityKind,
  id: string,
  project?: string,
  publicId?: string,
): string {
  switch (kind) {
    case 'project':
      return `/admin/projects/${id}/edit/`;
    case 'project-section':
      return `/admin/projects/${project ?? ''}/edit/${publicId ? `?section=${encodeURIComponent(publicId)}` : ''}`;
    case 'event':
      return `/admin/events/${id}/edit/`;
    case 'diary-entry':
      return `/admin/diary/${id}/edit/`;
    case 'page':
      return `/admin/pages/${id}/edit/`;
    case 'tag':
      return `/admin/tags/${id}/edit/`;
    case 'profile':
      return '/admin/about/';
  }
}

export interface EntityFace {
  key: EntityKey;
  ref: string;
  /** What it is called: its title, a diary entry's day, the owner's name. */
  title: string;
  /** Where the owner edits it. */
  path: string;
  /** When it last changed; none for the kinds that keep no such time. */
  version?: number;
  /** A section's project. */
  project?: string;
}

type FaceRow = {
  id: string;
  title: string;
  updatedAt?: number;
  project?: string;
  publicId?: string;
};

function faceOf(kind: EntityKind, row: FaceRow): EntityFace {
  const key: EntityKey = {
    kind,
    id: row.id,
    ...(kind === 'diary-entry' ? { date: row.title } : {}),
  };
  return {
    key,
    ref: refOf(key),
    title: row.title,
    path: adminPath(kind, row.id, row.project, row.publicId),
    ...(row.updatedAt !== undefined ? { version: row.updatedAt } : {}),
    ...(row.project ? { project: row.project } : {}),
  };
}

function selection(columns: ReturnType<typeof tableOf>) {
  return {
    id: columns.id,
    title: columns.title,
    ...(columns.updatedAt ? { updatedAt: columns.updatedAt } : {}),
    ...('project' in columns ? { project: columns.project } : {}),
    ...('publicId' in columns ? { publicId: columns.publicId } : {}),
  };
}

/**
 * What an entity is called, where it is edited and when it changed — or
 * nothing, when it is gone. Read in `tx` when given, so a write can ask
 * about what it is writing.
 */
export function entityFace(key: EntityKey, tx?: any): EntityFace | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const columns = tableOf(schema, key.kind);
  const row = (tx ?? db)
    .select(selection(columns))
    .from(columns.table)
    .where(eq(columns.id, key.kind === 'profile' ? PROFILE_ID : key.id))
    .get() as FaceRow | undefined;
  return row ? faceOf(key.kind, row) : undefined;
}

/** Many entities at once, keyed `kind:id` by their stored ids. */
export function entityFaces(
  keys: { kind: EntityKind; id: string }[],
): Map<string, EntityFace> {
  const { db, schema } = THEI_SERVER.useDb();
  const faces = new Map<string, EntityFace>();
  for (const kind of ENTITY_KINDS) {
    const ids = [
      ...new Set(keys.filter((key) => key.kind === kind).map((key) => key.id)),
    ];
    if (!ids.length) continue;
    const columns = tableOf(schema, kind);
    for (const row of db
      .select(selection(columns))
      .from(columns.table)
      .where(inArray(columns.id, ids))
      .all() as FaceRow[])
      faces.set(`${kind}:${row.id}`, faceOf(kind, row));
  }
  return faces;
}

/** The entity a ref names, when it names one that exists. */
export function findEntity(ref: unknown): EntityKey | undefined {
  const parsed = parseRef(ref);
  if (!parsed) return undefined;
  if (parsed.kind === 'diary-entry' && isLifeDay(parsed.id)) {
    const { db, schema } = THEI_SERVER.useDb();
    const row = db
      .select({ id: schema.diaryEntries.diaryUuid })
      .from(schema.diaryEntries)
      .where(eq(schema.diaryEntries.date, parsed.id))
      .get();
    return row
      ? { kind: 'diary-entry', id: row.id, date: parsed.id }
      : undefined;
  }
  return entityFace(parsed)?.key;
}

/** When an entity last changed, read in `tx` when given; none if gone. */
export function entityVersion(key: EntityKey, tx?: any): number | undefined {
  return entityFace(key, tx)?.version;
}

/**
 * Whose edit form an entity is changed in: a section's is its project's;
 * every other entity has its own.
 */
export function formOwnerOf(key: EntityKey, tx?: any): EntityKey | undefined {
  if (key.kind !== 'project-section') return key;
  const project = entityFace(key, tx)?.project;
  return project ? { kind: 'project', id: project } : undefined;
}

/** The version of the form an entity is edited in. */
export function formOwnerVersion(key: EntityKey, tx?: any): number | undefined {
  const owner = formOwnerOf(key, tx);
  return owner ? entityVersion(owner, tx) : undefined;
}

/** The whole stored row of an entity, for what only a field can tell. */
export function entityRow(key: EntityKey): Record<string, unknown> | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const columns = tableOf(schema, key.kind);
  return db
    .select()
    .from(columns.table)
    .where(eq(columns.id, key.kind === 'profile' ? PROFILE_ID : key.id))
    .get();
}

export interface EntityText {
  /** The name a client uses for it. */
  name: string;
  slot: ContentSlot;
  /** Only the owner sees it, whatever the entity's access. */
  private: boolean;
}

/** The texts each kind holds, by the name a client uses for them. */
export const ENTITY_TEXT_SLOTS: Record<EntityKind, EntityText[]> = {
  project: [
    { name: 'description', slot: 'project-description', private: false },
    { name: 'notes', slot: 'project-notes', private: true },
  ],
  'project-section': [
    { name: 'body', slot: 'project-section-body', private: false },
  ],
  event: [
    { name: 'body', slot: 'event-body', private: false },
    { name: 'notes', slot: 'event-notes', private: true },
  ],
  'diary-entry': [
    { name: 'body', slot: 'diary-body', private: false },
    { name: 'notes', slot: 'diary-notes', private: true },
  ],
  page: [
    { name: 'body', slot: 'page-body', private: false },
    { name: 'notes', slot: 'page-notes', private: true },
  ],
  tag: [],
  profile: [{ name: 'about', slot: 'profile-about', private: false }],
};

/**
 * The text an entity's page shows: its headings are the page's, and a link
 * to a place in the entity names one of them. None for a tag.
 */
export function entityPageText(kind: EntityKind) {
  return ENTITY_TEXT_SLOTS[kind].find((text) => !text.private);
}

/** One of an entity's texts by its name. */
export function entityText(kind: EntityKind, name: unknown) {
  return ENTITY_TEXT_SLOTS[kind].find((text) => text.name === name);
}

/** One of an entity's texts by the slot it is stored in. */
export function entityTextOfSlot(kind: EntityKind, slot: unknown) {
  return ENTITY_TEXT_SLOTS[kind]?.find((text) => text.slot === slot);
}

/** A text may be emptied, except a diary entry's body: the entry is it. */
export function textMayBeEmpty(slot: ContentSlot): boolean {
  return slot !== 'diary-body';
}

/**
 * Who may see an entity, as each kind offers it. A diary entry is public or
 * private: a link to one day is never asked for.
 */
export const ENTITY_ACCESS: Partial<
  Record<EntityKind, readonly ProjectEventAccessLevel[]>
> = {
  project: [
    ProjectEventAccessLevel.Public,
    ProjectEventAccessLevel.LinkOnly,
    ProjectEventAccessLevel.Private,
  ],
  event: [
    ProjectEventAccessLevel.Public,
    ProjectEventAccessLevel.LinkOnly,
    ProjectEventAccessLevel.Private,
  ],
  page: [
    ProjectEventAccessLevel.Public,
    ProjectEventAccessLevel.LinkOnly,
    ProjectEventAccessLevel.Private,
  ],
  'diary-entry': [
    ProjectEventAccessLevel.Public,
    ProjectEventAccessLevel.Private,
  ],
};
