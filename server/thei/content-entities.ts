import { and, eq, inArray } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type {
  ContentEntityReference,
  ContentEntityType,
} from '#layers/thei/shared/content-link';
import {
  buildContentPreview,
  type ContentOutputData,
  type ContentOwnerType,
  type ContentSlot,
} from '#layers/thei/shared/content';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { InternalUrlTarget } from '#layers/thei/shared/internal-url';
import { diaryLead } from '#layers/thei/shared/diary-text';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import {
  buildExcerptUrl,
  excerptParentContentEntity,
} from '#layers/thei/shared/excerpt-url';
import {
  findExcerpt,
  listExcerpts,
  readExcerptSubjects,
  type ExcerptRecord,
} from './excerpts';
import {
  excerptAccess,
  excerptOpens,
  excerptShownWithParent,
  findExcerptParentByAddress,
  loadExcerptParent,
  loadExcerptParents,
  type ExcerptParentInfo,
} from './excerpts/parents';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import type { ShareGrantOwner } from '#layers/thei/shared/share-link';
import {
  buildAdminAssetUrls,
  buildPublicPageMedia,
  buildPublicProjectMedia,
  buildPublicTagMedia,
} from './assets/urls';
import { resolveEntityIconMedia } from './media/generated-icon';
import { buildAdminEntityBanner, buildPublicBanner } from './entity-banner';
import {
  OWNER,
  opensGrantOwner,
  opensPrivate,
  type PublicViewer,
} from './access-links/viewer';
import {
  buildPublicContentPreviewMedia,
  type PublicContentEntity,
} from './public/content';

/**
 * Any entity content can link to, described the same way whatever its kind.
 *
 * The link resolver, the picker and the sidebar each used to spell out the
 * kinds they knew and look each one up by hand; this is the one place that
 * knows how a project, a section, an event, a diary entry, a page and a tag
 * are found, what they are called, where they live and who may open
 * them.
 */
export type ContentEntityRecord = {
  entityType: ContentEntityType;
  entityId: string;
  title: string;
  summary: string;
  href: string;
  /**
   * Who may open it. A section is as open as its project, unless it is
   * marked private on its own.
   */
  access: ProjectEventAccessLevel;
  updatedAt: number;
  humanReadableSlug: string;
  publicId?: string;
  /** Other names it is found by: never shown, only searched. */
  synonyms?: string[];
  /** The day of a diary entry, which is also its title. */
  date?: string;
  /** The project a section belongs to; the parent of an excerpt, a diary entry by its day. */
  parent?: { title: string; href: string };
  /**
   * The entity whose share link opens this one's private side: itself, the
   * project of a section, the parent of an excerpt. A tag has none; it is
   * never private on its own.
   */
  grantOwner?: ShareGrantOwner;
  /**
   * Whether a viewer may open it, where one entity's link does not say it:
   * an excerpt opens to whoever may open both its parent and what it is
   * about (`excerptOpens`). Read through `contentEntityOpens`.
   */
  opens?: (viewer: PublicViewer) => boolean;
  /**
   * The picture that stands for the entity: its icon, its banner, or the
   * first picture of its body. Drawn on demand, because a search lists far more entities than
   * it ever shows. `admin` serves the files through the admin's own preview
   * addresses; `public` through the entity's public ones, from the public part
   * of its body unless `includePrivate`.
   */
  media: (
    view: MediaView,
    includePrivate?: boolean,
  ) => Promise<MediaDescriptor>;
};

export type MediaView = 'admin' | 'public';

type ProjectRow = {
  projectUuid: string;
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  synonyms?: string[];
  updatedAt: number;
};
type ChildRow = {
  projectUuid: string;
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  isPrivate: boolean;
  updatedAt: number;
};
type EventRow = Omit<ProjectRow, 'projectUuid'> & { eventUuid: string };
type PageRow = {
  pageUuid: string;
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  slug: string;
  synonyms?: string[];
  updatedAt: number;
};
type DiaryRow = {
  diaryUuid: string;
  date: string;
  access: ProjectEventAccessLevel;
  updatedAt: number;
};

type TagRow = {
  tagUuid: string;
  title: string;
  slug: string;
  publicId: string;
  description: string;
  synonyms?: string[];
};

function iconMedia(
  kind: 'project' | 'page' | 'tag',
  id: string,
  publicMedia: (asset: any) => Promise<MediaDescriptor>,
) {
  return async (view: MediaView) => {
    const icon = (
      await THEI_SERVER.assets.usages.findByContainer(kind, id)
    ).find((usage) => usage.role === 'icon');
    return resolveEntityIconMedia(
      kind,
      id,
      icon
        ? view === 'admin'
          ? (await buildAdminAssetUrls(icon.asset)).media!
          : await publicMedia(icon.asset)
        : undefined,
    );
  };
}

/**
 * The banner of an event or a section, else the first picture of the body,
 * else the drawn icon of the kind when the body opens with none — the same
 * fallback a project without an icon gets.
 */
function bodyMedia(
  ownerType: BodyEntityKind,
  id: string,
  slot: ContentSlot,
  context: PublicContentEntity,
  banner?: (view: MediaView) => Promise<MediaDescriptor | undefined>,
) {
  return async (view: MediaView, includePrivate = false) =>
    (await banner?.(view)) ??
    resolveEntityIconMedia(
      ownerType,
      id,
      view === 'admin'
        ? buildContentPreview(
            (await THEI_SERVER.content.buildFieldValue(ownerType, id, slot))
              ?.data,
          ).media
        : await buildPublicContentPreviewMedia(
            ownerType,
            id,
            slot,
            context,
            includePrivate,
          ),
    );
}

type BodyEntityKind = Extract<
  ContentOwnerType,
  'event' | 'project-section' | 'excerpt' | 'diary-entry'
>;

function projectRecord(project: ProjectRow): ContentEntityRecord {
  return {
    entityType: 'project',
    entityId: project.projectUuid,
    title: project.title,
    summary: project.summary,
    href: buildProjectUrl(project.humanReadableSlug, project.publicId),
    access: project.access,
    updatedAt: project.updatedAt,
    humanReadableSlug: project.humanReadableSlug,
    publicId: project.publicId,
    synonyms: project.synonyms,
    grantOwner: { entityType: 'project', entityId: project.projectUuid },
    media: iconMedia('project', project.projectUuid, (asset) =>
      buildPublicProjectMedia(project, asset, 'icon'),
    ),
  };
}

function sectionRecord(
  id: string,
  child: ChildRow,
  project: ProjectRow,
): ContentEntityRecord {
  return {
    entityType: 'project-section',
    entityId: id,
    title: child.title,
    summary: child.summary,
    href: buildProjectSectionUrl(
      project.humanReadableSlug,
      project.publicId,
      child.humanReadableSlug,
      child.publicId,
    ),
    access: child.isPrivate ? ProjectEventAccessLevel.Private : project.access,
    updatedAt: child.updatedAt,
    humanReadableSlug: child.humanReadableSlug,
    publicId: child.publicId,
    parent: {
      title: project.title,
      href: buildProjectUrl(project.humanReadableSlug, project.publicId),
    },
    grantOwner: { entityType: 'project', entityId: child.projectUuid },
    media: bodyMedia(
      'project-section',
      id,
      'project-section-body',
      { type: 'project', ...project },
      (view) =>
        view === 'admin'
          ? buildAdminEntityBanner('project-section', id)
          : buildPublicBanner({
              type: 'project-section',
              project,
              section: { ...child, sectionUuid: id },
            }),
    ),
  };
}

/**
 * Whether a viewer may open an entity: by its access, its share link's
 * holder and the owner beside, or by its own rule where it has one.
 */
export function contentEntityOpens(
  entity: Pick<ContentEntityRecord, 'access' | 'grantOwner' | 'opens'>,
  viewer: PublicViewer,
): boolean {
  if (entity.opens) return entity.opens(viewer);
  return (
    entity.access !== ProjectEventAccessLevel.Private ||
    opensGrantOwner(viewer, entity.grantOwner)
  );
}

/**
 * An excerpt is as open as the stricter of its parent and what it is about,
 * unless it is private, and is opened by whoever may open both; its parent
 * is what it belongs to, and its private side. Its pictures are served from
 * the parent's address.
 */
function excerptRecord(
  excerpt: ExcerptRecord,
  parent: ExcerptParentInfo,
): ContentEntityRecord {
  const holder = { type: 'excerpt', parent: parent.address, excerpt } as const;
  return {
    entityType: 'excerpt',
    entityId: excerpt.excerptUuid,
    title: excerpt.title,
    summary: excerpt.summary,
    href: buildExcerptUrl(
      parent.address,
      excerpt.humanReadableSlug,
      excerpt.publicId,
    ),
    access: excerptAccess(excerpt, parent),
    updatedAt: excerpt.updatedAt,
    humanReadableSlug: excerpt.humanReadableSlug,
    publicId: excerpt.publicId,
    parent: { title: parent.title || parent.date || '', href: parent.href },
    grantOwner: { entityType: parent.type, entityId: parent.id },
    opens: (viewer) => excerptOpens(viewer, excerpt, parent),
    media: bodyMedia(
      'excerpt',
      excerpt.excerptUuid,
      'excerpt-body',
      excerptParentContentEntity(parent.address),
      (view) =>
        view === 'admin'
          ? buildAdminEntityBanner('excerpt', excerpt.excerptUuid)
          : buildPublicBanner(holder),
    ),
  };
}

function eventRecord(event: EventRow): ContentEntityRecord {
  return {
    entityType: 'event',
    entityId: event.eventUuid,
    title: event.title,
    summary: event.summary,
    href: buildEventUrl(event.humanReadableSlug, event.publicId),
    access: event.access,
    updatedAt: event.updatedAt,
    humanReadableSlug: event.humanReadableSlug,
    publicId: event.publicId,
    synonyms: event.synonyms,
    grantOwner: { entityType: 'event', entityId: event.eventUuid },
    media: bodyMedia(
      'event',
      event.eventUuid,
      'event-body',
      { type: 'event', ...event },
      (view) =>
        view === 'admin'
          ? buildAdminEntityBanner('event', event.eventUuid)
          : buildPublicBanner({ type: 'event', event }),
    ),
  };
}

function pageRecord(page: PageRow): ContentEntityRecord {
  return {
    entityType: 'page',
    entityId: page.pageUuid,
    title: page.title,
    summary: page.summary,
    href: buildPageUrl(page.slug),
    access: page.access,
    updatedAt: page.updatedAt,
    humanReadableSlug: page.slug,
    synonyms: page.synonyms,
    grantOwner: { entityType: 'page', entityId: page.pageUuid },
    media: iconMedia('page', page.pageUuid, (asset) =>
      buildPublicPageMedia(page, asset),
    ),
  };
}

/**
 * A tag has no visibility of its own: a stranger may open it once a public
 * project or event carries it, exactly when its own page answers them.
 */
function tagRecord(tag: TagRow, isPublic: boolean): ContentEntityRecord {
  return {
    entityType: 'tag',
    entityId: tag.tagUuid,
    title: tag.title,
    summary: tag.description,
    href: buildTagUrl(tag.slug, tag.publicId),
    access: isPublic
      ? ProjectEventAccessLevel.Public
      : ProjectEventAccessLevel.Private,
    updatedAt: 0,
    humanReadableSlug: tag.slug,
    publicId: tag.publicId,
    synonyms: tag.synonyms,
    media: iconMedia('tag', tag.tagUuid, (asset) =>
      buildPublicTagMedia(tag, asset),
    ),
  };
}

/** Which of the given tags (or of all of them) a public project or event carries. */
function publicTagUuids(tagUuids?: string[]): Set<string> {
  const { db, schema } = THEI_SERVER.useDb();
  const { tagUsages, projects, events } = schema;
  const only = tagUuids ? inArray(tagUsages.tagUuid, tagUuids) : undefined;
  const viaProjects = db
    .selectDistinct({ tagUuid: tagUsages.tagUuid })
    .from(tagUsages)
    .innerJoin(projects, eq(tagUsages.containerId, projects.projectUuid))
    .where(
      and(
        eq(tagUsages.containerType, 'project'),
        eq(projects.access, ProjectEventAccessLevel.Public),
        only,
      ),
    )
    .all();
  const viaEvents = db
    .selectDistinct({ tagUuid: tagUsages.tagUuid })
    .from(tagUsages)
    .innerJoin(events, eq(tagUsages.containerId, events.eventUuid))
    .where(
      and(
        eq(tagUsages.containerType, 'event'),
        eq(events.access, ProjectEventAccessLevel.Public),
        only,
      ),
    )
    .all();
  return new Set([...viaProjects, ...viaEvents].map((row) => row.tagUuid));
}

function tagRecordOf(tag: TagRow | undefined) {
  return tag && tagRecord(tag, publicTagUuids([tag.tagUuid]).has(tag.tagUuid));
}

/**
 * A diary entry is called by its day, and its lead — what it is about, then
 * how it begins — stands in for a summary, built for a visitor from the
 * public part of its text and its public excerpts only.
 */
function diaryRecord(
  entry: DiaryRow,
  body: ContentOutputData | null | undefined,
  excerptTitles: string[],
  includePrivate: boolean,
): ContentEntityRecord {
  return {
    entityType: 'diary-entry',
    entityId: entry.diaryUuid,
    title: entry.date,
    summary: diaryLead({
      data: body,
      excerptTitles,
      includePrivate,
      privateLabel: THEI_SERVER.phrase.content_private_section,
    }),
    href: buildDiaryUrl(entry.date),
    access: entry.access,
    updatedAt: entry.updatedAt,
    humanReadableSlug: entry.date,
    date: entry.date,
    grantOwner: { entityType: 'diary-entry', entityId: entry.diaryUuid },
    media: bodyMedia('diary-entry', entry.diaryUuid, 'diary-body', {
      type: 'diary-entry',
      date: entry.date,
    }),
  };
}

async function diaryBody(diaryUuid: string) {
  return (
    await THEI_SERVER.content.findByOwner(
      'diary-entry',
      diaryUuid,
      'diary-body',
    )
  )?.data;
}

/**
 * The titles of the excerpts of each of several entries, in the owner's
 * order, in one query: those the viewer sees on the entry's page
 * (`excerptShownWithParent`) — a visitor's leave out the private ones and
 * those about something the visitor may not see.
 */
function diaryExcerptTitles(
  diaryUuids: string[],
  viewer: PublicViewer,
): Map<string, string[]> {
  const titles = new Map<string, string[]>();
  if (!diaryUuids.length) return titles;
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      excerptUuid: schema.excerpts.excerptUuid,
      parentId: schema.excerpts.parentId,
      title: schema.excerpts.title,
      isPrivate: schema.excerpts.isPrivate,
    })
    .from(schema.excerpts)
    .where(
      and(
        eq(schema.excerpts.parentType, 'diary-entry'),
        inArray(schema.excerpts.parentId, diaryUuids),
      ),
    )
    .orderBy(schema.excerpts.sortOrder)
    .all();
  const subjects = readExcerptSubjects(
    db,
    schema,
    rows.map((row) => row.excerptUuid),
  );
  for (const row of rows) {
    const excerpt = {
      isPrivate: row.isPrivate,
      subject: subjects.get(row.excerptUuid) ?? null,
    };
    const parent = { type: 'diary-entry', id: row.parentId } as const;
    if (!excerptShownWithParent(viewer, excerpt, parent)) continue;
    titles.set(row.parentId, [...(titles.get(row.parentId) ?? []), row.title]);
  }
  return titles;
}

async function diaryRecordOf(
  entry: DiaryRow,
  viewer: PublicViewer,
): Promise<ContentEntityRecord> {
  const includePrivate = opensPrivate(viewer, 'diary-entry', entry.diaryUuid);
  return diaryRecord(
    entry,
    await diaryBody(entry.diaryUuid),
    diaryExcerptTitles([entry.diaryUuid], viewer).get(entry.diaryUuid) ?? [],
    includePrivate,
  );
}

/**
 * One entity by its kind and uuid. The viewer only decides how much of a diary
 * entry's text its summary may quote; whether the reader may open the entity
 * at all is the caller's call, made from `access` and `grantOwner`.
 */
export async function findContentEntity(
  reference: Pick<ContentEntityReference, 'entityType' | 'entityId'>,
  viewer: PublicViewer,
): Promise<ContentEntityRecord | undefined> {
  const { entityType, entityId } = reference;
  if (!entityId) return undefined;
  switch (entityType) {
    case 'project': {
      const project = await THEI_SERVER.projects.findByUuid(entityId);
      return project && projectRecord(project);
    }
    case 'project-section': {
      const { db, schema } = THEI_SERVER.useDb();
      const child = db
        .select()
        .from(schema.projectContentSections)
        .where(eq(schema.projectContentSections.sectionUuid, entityId))
        .get();
      const project =
        child && (await THEI_SERVER.projects.findByUuid(child.projectUuid));
      return child && project
        ? sectionRecord(entityId, child, project)
        : undefined;
    }
    case 'excerpt': {
      const excerpt = findExcerpt(entityId);
      const parent =
        excerpt &&
        (await loadExcerptParent(excerpt.parentType, excerpt.parentId));
      return excerpt && parent ? excerptRecord(excerpt, parent) : undefined;
    }
    case 'event': {
      const event = await THEI_SERVER.events.findByUuid(entityId);
      return event && eventRecord(event);
    }
    case 'page': {
      const page = await THEI_SERVER.pages.findByUuid(entityId);
      return page && pageRecord(page);
    }
    case 'diary-entry': {
      const entry = await THEI_SERVER.diary.findByUuid(entityId);
      return entry && (await diaryRecordOf(entry, viewer));
    }
    case 'tag': {
      const { db, schema } = THEI_SERVER.useDb();
      return tagRecordOf(
        db
          .select()
          .from(schema.tags)
          .where(eq(schema.tags.tagUuid, entityId))
          .get(),
      );
    }
  }
}

/**
 * The entity an address of this site names, found by the public parts of
 * that address. A section must belong to the project the address puts it
 * under: a public ID moved to another project is a different link.
 */
export async function findContentEntityByTarget(
  target: InternalUrlTarget,
  viewer: PublicViewer,
): Promise<ContentEntityRecord | undefined> {
  switch (target.entityType) {
    case 'project': {
      const project = await THEI_SERVER.projects.findByPublicId(
        target.publicId,
      );
      return project && projectRecord(project);
    }
    case 'project-section': {
      const project = await THEI_SERVER.projects.findByPublicId(
        target.projectPublicId,
      );
      if (!project) return undefined;
      const { db, schema } = THEI_SERVER.useDb();
      const section = db
        .select()
        .from(schema.projectContentSections)
        .where(
          and(
            eq(schema.projectContentSections.projectUuid, project.projectUuid),
            eq(schema.projectContentSections.publicId, target.publicId),
          ),
        )
        .get();
      return section
        ? sectionRecord(section.sectionUuid, section, project)
        : undefined;
    }
    case 'excerpt': {
      const parent = await findExcerptParentByAddress(target.parent);
      const excerpt =
        parent &&
        listExcerpts(parent).find((item) => item.publicId === target.publicId);
      return parent && excerpt ? excerptRecord(excerpt, parent) : undefined;
    }
    case 'event': {
      const event = await THEI_SERVER.events.findByPublicId(target.publicId);
      return event && eventRecord(event);
    }
    case 'page': {
      const page = await THEI_SERVER.pages.findBySlug(target.slug);
      return page && pageRecord(page);
    }
    case 'diary-entry': {
      const entry = await THEI_SERVER.diary.findByDate(target.date);
      return entry && (await diaryRecordOf(entry, viewer));
    }
    case 'tag': {
      const { db, schema } = THEI_SERVER.useDb();
      return tagRecordOf(
        db
          .select()
          .from(schema.tags)
          .where(eq(schema.tags.publicId, target.publicId))
          .get(),
      );
    }
  }
}

/**
 * Every entity of the given kinds, for the admin's picker. The admin sees the
 * whole of everything, so diary summaries quote private sections too.
 */
export async function listContentEntities(
  types: ReadonlySet<ContentEntityType>,
): Promise<ContentEntityRecord[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const records: ContentEntityRecord[] = [];
  const needsProjects = types.has('project') || types.has('project-section');
  const projects = needsProjects
    ? new Map(
        db
          .select()
          .from(schema.projects)
          .all()
          .map((project) => [project.projectUuid, project]),
      )
    : new Map<string, ProjectRow>();
  if (types.has('project'))
    records.push(...[...projects.values()].map(projectRecord));
  if (types.has('project-section'))
    for (const section of db
      .select()
      .from(schema.projectContentSections)
      .all()) {
      const project = projects.get(section.projectUuid);
      if (project)
        records.push(sectionRecord(section.sectionUuid, section, project));
    }
  if (types.has('event'))
    records.push(...db.select().from(schema.events).all().map(eventRecord));
  if (types.has('page'))
    records.push(...db.select().from(schema.pages).all().map(pageRecord));
  if (types.has('diary-entry')) {
    const entries = db.select().from(schema.diaryEntries).all();
    const bodies = entries.length
      ? new Map(
          db
            .select({
              ownerId: schema.content.ownerId,
              data: schema.content.data,
            })
            .from(schema.content)
            .where(
              and(
                eq(schema.content.ownerType, 'diary-entry'),
                eq(schema.content.slot, 'diary-body'),
                inArray(
                  schema.content.ownerId,
                  entries.map((entry) => entry.diaryUuid),
                ),
              ),
            )
            .all()
            .map((row) => [row.ownerId, row.data]),
        )
      : new Map();
    const titles = diaryExcerptTitles(
      entries.map((entry) => entry.diaryUuid),
      OWNER,
    );
    records.push(
      ...entries.map((entry) =>
        diaryRecord(
          entry,
          bodies.get(entry.diaryUuid),
          titles.get(entry.diaryUuid) ?? [],
          true,
        ),
      ),
    );
  }
  if (types.has('excerpt')) {
    // Each parent's list once, banners and all, the parents read a kind at a
    // time; the picker lists every one.
    const keys = new Map<
      string,
      { type: ExcerptParentInfo['type']; id: string }
    >();
    for (const row of db
      .select({
        parentType: schema.excerpts.parentType,
        parentId: schema.excerpts.parentId,
      })
      .from(schema.excerpts)
      .all())
      keys.set(`${row.parentType}:${row.parentId}`, {
        type: row.parentType,
        id: row.parentId,
      });
    const parents = loadExcerptParents([...keys.values()]);
    for (const key of keys.keys()) {
      const parent = parents.get(key);
      if (!parent) continue;
      for (const excerpt of listExcerpts(parent))
        records.push(excerptRecord(excerpt, parent));
    }
  }
  if (types.has('tag')) {
    const open = publicTagUuids();
    records.push(
      ...db
        .select()
        .from(schema.tags)
        .all()
        .map((tag) => tagRecord(tag, open.has(tag.tagUuid))),
    );
  }
  return records;
}
