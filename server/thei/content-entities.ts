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
import { diaryContentExcerpt } from '#layers/thei/shared/diary-text';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import {
  buildProjectChildUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import {
  buildAdminAssetUrls,
  buildPublicPageMedia,
  buildPublicProjectMedia,
  buildPublicTagMedia,
} from './assets/urls';
import { resolveEntityIconMedia } from './media/generated-icon';
import {
  buildPublicContentPreviewMedia,
  type PublicContentEntity,
} from './public/content';

/**
 * Any entity content can link to, described the same way whatever its kind.
 *
 * The link resolver, the picker and the sidebar each used to spell out the
 * kinds they knew and look each one up by hand; this is the one place that
 * knows how a project, a stage, a section, an event, a diary entry, a page and
 * a tag are found, what they are called, where they live and who may open
 * them.
 */
export type ContentEntityRecord = {
  entityType: ContentEntityType;
  entityId: string;
  title: string;
  summary: string;
  href: string;
  /**
   * Who may open it. A stage or a section is as open as its project, unless
   * it is marked private on its own.
   */
  access: ProjectEventAccessLevel;
  updatedAt: number;
  humanReadableSlug: string;
  publicId?: string;
  /** The day of a diary entry, which is also its title. */
  date?: string;
  /** The project a stage or a section belongs to. */
  parent?: { title: string; href: string };
  /**
   * The picture that stands for the entity: its icon, or the first picture of
   * its body. Drawn on demand, because a search lists far more entities than
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
 * The first picture of the body, or the drawn icon of the kind when the body
 * opens with none — the same fallback a project without an icon gets.
 */
function bodyMedia(
  ownerType: BodyEntityKind,
  id: string,
  slot: ContentSlot,
  context: PublicContentEntity,
) {
  return async (view: MediaView, includePrivate = false) =>
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
  'event' | 'project-stage' | 'project-section' | 'diary-entry'
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
    media: iconMedia('project', project.projectUuid, (asset) =>
      buildPublicProjectMedia(project, asset, 'icon'),
    ),
  };
}

function childRecord(
  kind: 'project-stage' | 'project-section',
  id: string,
  child: ChildRow,
  project: ProjectRow,
): ContentEntityRecord {
  return {
    entityType: kind,
    entityId: id,
    title: child.title,
    summary: child.summary,
    href: buildProjectChildUrl(
      project.humanReadableSlug,
      project.publicId,
      kind === 'project-stage' ? 'stages' : 'sections',
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
    media: bodyMedia(
      kind,
      id,
      kind === 'project-stage' ? 'project-stage-body' : 'project-section-body',
      { type: 'project', ...project },
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
    media: bodyMedia('event', event.eventUuid, 'event-body', {
      type: 'event',
      ...event,
    }),
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
 * A diary entry is called by its day, and its opening lines stand in for a
 * summary — cut, for a visitor, from the public part of its text only.
 */
function diaryRecord(
  entry: DiaryRow,
  body: ContentOutputData | null | undefined,
  includePrivate: boolean,
): ContentEntityRecord {
  return {
    entityType: 'diary-entry',
    entityId: entry.diaryUuid,
    title: entry.date,
    summary: diaryContentExcerpt(
      body,
      includePrivate,
      THEI_SERVER.phrase.content_private_section,
    ),
    href: buildDiaryUrl(entry.date),
    access: entry.access,
    updatedAt: entry.updatedAt,
    humanReadableSlug: entry.date,
    date: entry.date,
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
 * One entity by its kind and uuid. `includePrivate` only decides how much of
 * a diary entry's text its summary may quote; whether the reader may open the
 * entity at all is the caller's call, made from `access`.
 */
export async function findContentEntity(
  reference: Pick<ContentEntityReference, 'entityType' | 'entityId'>,
  includePrivate: boolean,
): Promise<ContentEntityRecord | undefined> {
  const { entityType, entityId } = reference;
  if (!entityId) return undefined;
  switch (entityType) {
    case 'project': {
      const project = await THEI_SERVER.projects.findByUuid(entityId);
      return project && projectRecord(project);
    }
    case 'project-stage':
    case 'project-section': {
      const { db, schema } = THEI_SERVER.useDb();
      const table =
        entityType === 'project-stage'
          ? schema.projectStages
          : schema.projectContentSections;
      const key =
        entityType === 'project-stage'
          ? schema.projectStages.stageUuid
          : schema.projectContentSections.sectionUuid;
      const child = db.select().from(table).where(eq(key, entityId)).get();
      const project =
        child && (await THEI_SERVER.projects.findByUuid(child.projectUuid));
      return child && project
        ? childRecord(entityType, entityId, child, project)
        : undefined;
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
      return (
        entry &&
        diaryRecord(entry, await diaryBody(entry.diaryUuid), includePrivate)
      );
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
 * that address. A stage or a section must belong to the project the address
 * puts it under: a public ID moved to another project is a different link.
 */
export async function findContentEntityByTarget(
  target: InternalUrlTarget,
  includePrivate: boolean,
): Promise<ContentEntityRecord | undefined> {
  switch (target.entityType) {
    case 'project': {
      const project = await THEI_SERVER.projects.findByPublicId(
        target.publicId,
      );
      return project && projectRecord(project);
    }
    case 'project-stage':
    case 'project-section': {
      const project = await THEI_SERVER.projects.findByPublicId(
        target.projectPublicId,
      );
      if (!project) return undefined;
      const { db, schema } = THEI_SERVER.useDb();
      if (target.entityType === 'project-stage') {
        const stage = db
          .select()
          .from(schema.projectStages)
          .where(
            and(
              eq(schema.projectStages.projectUuid, project.projectUuid),
              eq(schema.projectStages.publicId, target.publicId),
            ),
          )
          .get();
        return stage
          ? childRecord('project-stage', stage.stageUuid, stage, project)
          : undefined;
      }
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
        ? childRecord('project-section', section.sectionUuid, section, project)
        : undefined;
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
      return (
        entry &&
        diaryRecord(entry, await diaryBody(entry.diaryUuid), includePrivate)
      );
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
  const needsProjects =
    types.has('project') ||
    types.has('project-stage') ||
    types.has('project-section');
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
  if (types.has('project-stage'))
    for (const stage of db.select().from(schema.projectStages).all()) {
      const project = projects.get(stage.projectUuid);
      if (project)
        records.push(
          childRecord('project-stage', stage.stageUuid, stage, project),
        );
    }
  if (types.has('project-section'))
    for (const section of db
      .select()
      .from(schema.projectContentSections)
      .all()) {
      const project = projects.get(section.projectUuid);
      if (project)
        records.push(
          childRecord('project-section', section.sectionUuid, section, project),
        );
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
    records.push(
      ...entries.map((entry) =>
        diaryRecord(entry, bodies.get(entry.diaryUuid), true),
      ),
    );
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
