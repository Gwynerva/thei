import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  isPublicSecret,
  type PublicAssetDescriptor,
  type PublicSecretReference,
} from '#layers/thei/shared/api/public';
import {
  coverDatedPeriods,
  type DatedPeriod,
} from '#layers/thei/shared/date-precision';
import { utcDayOf } from '#layers/thei/shared/date-range';
import { dayArrives } from '#layers/thei/shared/life';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { PROFILE_ID } from '#layers/thei/shared/profile';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import type { SearchKind } from '#layers/thei/shared/search/api';
import { landingHash } from '#layers/thei/shared/search/landing';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import { OWNER, STRANGER, type PublicViewer } from '../access-links/viewer';
import { readFamilyDescriptions } from '../assets/descriptions';
import { getProfile, getProfileIdentity, getProfileLinks } from '../profile';
import { listProjectSections } from '../projects/content-sections';
import { buildPublicContentData } from '../public/content';
import {
  buildPublicDiaryEntry,
  buildPublicEvent,
  buildPublicPage,
  buildPublicProject,
  buildPublicProjectSection,
  buildPublicTagRows,
  canListPublicEntity,
} from '../public/entities';
import { resolvePublicRelated } from '../public/related';
import type { RelationEntityType } from '#layers/thei/shared/relation';
import type { StoredFilePlace } from './store';
import {
  contentUnits,
  fieldUnit,
  type SearchPlace,
  type SearchUnit,
} from './units';

export type SearchAudience = 'public' | 'owner';
export const SEARCH_AUDIENCES: readonly SearchAudience[] = ['public', 'owner'];

/**
 * One entity as one reader may find it: what its cards show, where it leads,
 * and every unit of words it holds for that reader. Built with the page's own
 * builders for that reader, so the stranger's is never wider than the page.
 */
export interface SearchDocument {
  audience: SearchAudience;
  kind: SearchKind;
  /** `project:<uuid>`, `file:<family>`…: one per entity and reader. */
  ref: string;
  /**
   * What a stranger's answer names it by: its public id or address — a
   * stranger never learns the ids things are stored by.
   */
  publicRef?: string;
  title: string;
  /** Of a section: the project it is a part of, with its icon. */
  parent?: { title: string; href: string; media?: MediaDescriptor };
  /** Of a file: what shows it first, by its own name alone. */
  shownAt?: string;
  href: string;
  editHref?: string;
  /**
   * How it is read by days: by the days of its life where it has them, by
   * when it was made where it has not — a page, a project with no dated
   * section. `life` keeps the two apart, those of a life first.
   */
  sort?: SearchSortDays;
  /** The day it is ordered and filtered by. */
  date?: string;
  period?: { startDate: string; endDate: string };
  /** Not found before this moment: a day that has not come. */
  visibleFrom: number;
  access?: 'link-only' | 'private';
  summary?: string;
  media?: MediaDescriptor;
  file?: { assetUuid: string; type: string; extension: string; size: number };
  showcase?: boolean;
  cv?: boolean;
  tags: string[];
  units: SearchUnit[];
}

/** The days a document is sorted by, `from` read oldest first, `to` newest. */
interface SearchSortDays {
  from: string;
  to: string;
  life: boolean;
}

/** Its period when it has one, else the day it was made. */
function sortOf(
  period: { startDate: string; endDate: string } | undefined,
  createdAt: number,
): SearchSortDays {
  if (period) return { from: period.startDate, to: period.endDate, life: true };
  const day = utcDayOf(createdAt);
  return { from: day, to: day, life: false };
}

/** The fingerprint of what a document shows: a pass rewrites only changed ones. */
export function documentFingerprint(document: SearchDocument): string {
  return createHash('sha1')
    .update(JSON.stringify(document))
    .digest('base64url');
}

const viewerOf = (audience: SearchAudience): PublicViewer =>
  audience === 'public' ? STRANGER : OWNER;

/** Who else may see an entity, told to the owner only. */
function accessOf(audience: SearchAudience, access: string) {
  if (audience !== 'owner') return {};
  return access === 'link-only' || access === 'private'
    ? { access: access as 'link-only' | 'private' }
    : {};
}

const names = (values: (string | undefined)[]) =>
  values.flatMap((value) =>
    fieldUnit('names', 'name', value, { hidden: true }),
  );

function tagUuidsOf(type: 'project' | 'event', id: string): string[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ tagUuid: schema.tagUsages.tagUuid })
    .from(schema.tagUsages)
    .where(
      and(
        eq(schema.tagUsages.containerType, type),
        eq(schema.tagUsages.containerId, id),
      ),
    )
    .orderBy(schema.tagUsages.sortOrder)
    .all()
    .map((row) => row.tagUuid);
}

function tagUnits(tagUuids: string[]): SearchUnit[] {
  if (!tagUuids.length) return [];
  const { db, schema } = THEI_SERVER.useDb();
  const wanted = new Set(tagUuids);
  return db
    .select()
    .from(schema.tags)
    .all()
    .filter((tag) => wanted.has(tag.tagUuid))
    .flatMap((tag) => [
      ...fieldUnit('names', 'tag', tag.title, {
        place: { relation: { title: tag.title }, zone: 'tags' },
      }),
      ...(tag.synonyms ?? []).flatMap((synonym) =>
        fieldUnit('names', 'tag', synonym, {
          hidden: true,
          place: { relation: { title: tag.title }, zone: 'tags' },
        }),
      ),
    ]);
}

function statusUnits(
  ownerType: 'project' | 'profile',
  ownerId: string,
): SearchUnit[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.statuses)
    .where(
      and(
        eq(schema.statuses.ownerType, ownerType),
        eq(schema.statuses.ownerId, ownerId),
      ),
    )
    .all()
    .filter((status) => status.kind === 'regular')
    .flatMap((status) =>
      fieldUnit('extra', 'status', status.text, {
        place: { status: { date: status.date } },
      }),
    );
}

/** The notes of an entity's relations, as its related block shows them. */
async function relationUnits(
  type: RelationEntityType,
  id: string,
  viewer: PublicViewer,
): Promise<SearchUnit[]> {
  const items = await resolvePublicRelated({ type, id }, viewer);
  return items.flatMap((item) =>
    item.secret || !item.note
      ? []
      : fieldUnit('extra', 'relation', item.note, {
          place: {
            relation: {
              title: item.target.title || item.target.date || '',
              kind: item.target.type,
              href: relationHref(item.target),
            },
          },
        }),
  );
}

/** The words of links and files of an entity's own list, as its sidebar shows them. */
function referenceUnits(references: {
  links: { note?: string; title: string; href: string }[];
}): SearchUnit[] {
  return references.links.flatMap((link) =>
    fieldUnit('extra', 'link', link.note, {
      place: {
        relation: { title: link.title },
        link: link.href,
        zone: 'links',
      },
    }),
  );
}

/** The address of a related entity, as the relations block links it. */
function relationHref(target: {
  type: RelationEntityType;
  humanReadableSlug: string;
  publicId: string;
  date?: string;
}): string {
  if (target.type === 'project')
    return buildProjectUrl(target.humanReadableSlug, target.publicId);
  if (target.type === 'event')
    return buildEventUrl(target.humanReadableSlug, target.publicId);
  return buildDiaryUrl(target.date ?? '');
}

/** The files of a page outside its text, each where the page shows it. */
function pageFileUnits(
  files: readonly (PublicAssetDescriptor | PublicSecretReference)[],
  zone: 'showcase' | 'files',
): SearchUnit[] {
  return files.flatMap((item) => {
    if (isPublicSecret(item)) return [];
    const place: SearchPlace = {
      file: {
        familyUuid: item.key,
        assetUuid: item.key,
        ...(item.title ? { title: item.title } : {}),
      },
      zone,
    };
    const media = item.media ? { media: item.media } : {};
    return [
      ...fieldUnit('extra', 'caption', item.title, { place, ...media }),
      ...fieldUnit('extra', 'caption', item.caption ?? item.description, {
        place,
        ...media,
      }),
      ...fieldUnit('extra', 'file', item.alt, { place, ...media }),
    ];
  });
}

/**
 * The pictures an entity opens with or is drawn by — its icon, its banner —
 * as places of their files: what the file is, its description, found where
 * the page shows it. A stranger names a file by its slug, never its id.
 */
function heroFileUnits(
  containerType: 'project' | 'project-section' | 'event' | 'page',
  id: string,
  audience: SearchAudience,
  media: Partial<Record<'icon' | 'banner', MediaDescriptor | undefined>>,
): SearchUnit[] {
  const { rawDb } = THEI_SERVER.useDb();
  const rows = rawDb
    .prepare(
      `SELECT u.role, a.assetUuid, a.slug, a.familyUuid FROM "asset-usages" u
       JOIN assets a ON a.assetUuid = u.assetUuid
       WHERE u.containerType = ? AND u.containerId = ? AND u.role IN ('icon', 'banner')`,
    )
    .all(containerType, id) as {
    role: 'icon' | 'banner';
    assetUuid: string;
    slug: string;
    familyUuid: string;
  }[];
  if (!rows.length) return [];
  const descriptions = readFamilyDescriptions(
    rows.map((row) => row.familyUuid),
  );
  return rows.flatMap((row) => {
    const shown = media[row.role];
    return fieldUnit('extra', 'file', descriptions.get(row.familyUuid), {
      place: {
        file: {
          familyUuid: row.familyUuid,
          assetUuid: audience === 'public' ? row.slug : row.assetUuid,
        },
        zone: row.role,
      },
      placeOnly: true,
      ...(shown ? { media: shown } : {}),
    });
  });
}

/** The private notes of an entity, each block at its place in them. */
function noteUnits(notes: Parameters<typeof contentUnits>[0]): SearchUnit[] {
  return placed(contentUnits(notes), { zone: 'owner-notes' }).map((unit) => ({
    ...unit,
    where: 'notes' as const,
    field: 'extra' as const,
  }));
}

/**
 * The families and kinds of the assets a document names, read at once. A
 * text served to a reader names its files by their slugs, never by their
 * storage ids, so either is looked up.
 */
function assetFamilies(uuids: string[]) {
  const { rawDb } = THEI_SERVER.useDb();
  const rows = new Map<
    string,
    { familyUuid: string; type: string; extension: string; size: number }
  >();
  for (let at = 0; at < uuids.length; at += 400) {
    const chunk = uuids.slice(at, at + 400);
    for (const row of rawDb
      .prepare(
        `SELECT assetUuid, slug, familyUuid, type, extension, size FROM assets WHERE assetUuid IN (${chunk.map(() => '?').join(',')}) OR slug IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk, ...chunk) as {
      assetUuid: string;
      slug: string;
      familyUuid: string;
      type: string;
      extension: string;
      size: number;
    }[]) {
      rows.set(row.assetUuid, row);
      rows.set(row.slug, row);
    }
  }
  return rows;
}

/** Each file of a document under its family, as the library knows it. */
function withFamilies(units: SearchUnit[]): SearchUnit[] {
  const uuids = [
    ...new Set(
      units.flatMap((unit) =>
        unit.place?.file ? [unit.place.file.assetUuid] : [],
      ),
    ),
  ];
  if (!uuids.length) return units;
  const families = assetFamilies(uuids);
  return units.map((unit) => {
    const file = unit.place?.file;
    const family = file && families.get(file.assetUuid);
    return family
      ? {
          ...unit,
          place: {
            ...unit.place,
            file: { ...file, familyUuid: family.familyUuid },
          },
        }
      : unit;
  });
}

function placed(units: SearchUnit[], place: SearchPlace): SearchUnit[] {
  return units.map((unit) => ({ ...unit, place: { ...place, ...unit.place } }));
}

export async function projectDocument(
  projectUuid: string,
  audience: SearchAudience,
): Promise<SearchDocument | undefined> {
  const project = await THEI_SERVER.projects.findByUuid(projectUuid);
  if (!project) return undefined;
  if (audience === 'public' && !canListPublicEntity(project.access, false))
    return undefined;
  const viewer = viewerOf(audience);
  const page = await buildPublicProject(project, viewer);
  const href = buildProjectUrl(project.humanReadableSlug, project.publicId);
  // A section is found as a result of its own (`sectionDocument`): the
  // project keeps only their titles, the parts it is made of.
  const sections = listProjectSections(project.projectUuid).filter(
    (section) => audience === 'owner' || !section.isPrivate,
  );
  const sectionUnits: SearchUnit[] = [];
  const days: DatedPeriod[] = [];
  for (const section of sections) {
    const place: SearchPlace = {
      section: {
        id: section.sectionUuid,
        title: section.title,
        href: buildProjectSectionUrl(
          project.humanReadableSlug,
          project.publicId,
          section.humanReadableSlug,
          section.publicId,
        ),
      },
    };
    sectionUnits.push(
      ...fieldUnit('headings', 'section', section.title, { place }),
    );
    days.push(...section.periods);
  }
  const showcaseUnits = pageFileUnits(page.showcase, 'showcase');
  const fileUnits = pageFileUnits(page.files, 'files');
  const tags = tagUuidsOf('project', project.projectUuid);
  const period = days.length ? coverDatedPeriods(days) : undefined;
  return {
    audience,
    kind: 'project',
    ref: `project:${project.projectUuid}`,
    publicRef: `project:${project.publicId}`,
    title: project.title,
    href,
    ...(audience === 'owner'
      ? { editHref: `/admin/projects/${project.projectUuid}/edit/` }
      : {}),
    ...(period
      ? {
          date: period.endDate,
          period: { startDate: period.startDate, endDate: period.endDate },
        }
      : {}),
    sort: sortOf(period, project.createdAt),
    visibleFrom: 0,
    ...accessOf(audience, project.access),
    summary: project.summary,
    media: page.iconMedia,
    showcase: project.showcase,
    cv: project.cv,
    tags,
    units: withFamilies([
      ...fieldUnit('title', 'title', project.title),
      ...fieldUnit('summary', 'summary', project.summary),
      ...names([project.humanReadableSlug, ...project.synonyms]),
      ...tagUnits(tags),
      ...contentUnits(page.description),
      ...heroFileUnits('project', project.projectUuid, audience, {
        icon: page.iconMedia,
        banner: page.bannerMedia,
      }),
      ...sectionUnits,
      ...showcaseUnits,
      ...fileUnits,
      ...referenceUnits(page.references),
      ...statusUnits('project', project.projectUuid),
      ...(await relationUnits('project', project.projectUuid, viewer)),
      ...noteUnits(page.notes),
    ]),
  };
}

/**
 * A section of a project as a result of its own: its title, description,
 * periods and text, found by those who may open its page — a stranger not
 * in a private section, nor in a project that is not public. It carries its
 * project's tags and names its project.
 */
export async function sectionDocument(
  sectionUuid: string,
  audience: SearchAudience,
): Promise<SearchDocument | undefined> {
  const { rawDb } = THEI_SERVER.useDb();
  const owner = rawDb
    .prepare(
      'SELECT projectUuid FROM "project-content-sections" WHERE sectionUuid = ?',
    )
    .get(sectionUuid) as { projectUuid: string } | undefined;
  const project =
    owner && (await THEI_SERVER.projects.findByUuid(owner.projectUuid));
  if (!project) return undefined;
  const section = listProjectSections(project.projectUuid).find(
    (item) => item.sectionUuid === sectionUuid,
  );
  if (!section) return undefined;
  if (
    audience === 'public' &&
    (section.isPrivate || !canListPublicEntity(project.access, false))
  )
    return undefined;
  const built = await buildPublicProjectSection(
    project,
    section,
    viewerOf(audience),
  );
  const period = section.periods.length
    ? coverDatedPeriods(section.periods)
    : undefined;
  return {
    audience,
    kind: 'project-section',
    ref: `project-section:${section.sectionUuid}`,
    publicRef: `project-section:${section.publicId}`,
    title: section.title,
    parent: {
      title: project.title,
      href: buildProjectUrl(project.humanReadableSlug, project.publicId),
      ...(built.project.iconMedia ? { media: built.project.iconMedia } : {}),
    },
    href: built.href,
    ...(audience === 'owner'
      ? {
          editHref: `/admin/projects/${project.projectUuid}/edit/?section=${section.publicId}`,
        }
      : {}),
    ...(period
      ? {
          date: period.endDate,
          period: { startDate: period.startDate, endDate: period.endDate },
        }
      : {}),
    sort: sortOf(period, section.createdAt),
    // A dated section waits for its day, as an event does.
    visibleFrom:
      audience === 'public' && period ? dayArrives(period.startDate) : 0,
    ...accessOf(audience, section.isPrivate ? 'private' : project.access),
    summary: section.summary,
    media: built.media,
    tags: tagUuidsOf('project', project.projectUuid),
    units: withFamilies([
      ...fieldUnit('title', 'title', section.title),
      ...fieldUnit('summary', 'summary', section.summary),
      ...names([section.humanReadableSlug]),
      ...section.periods.flatMap((item) =>
        fieldUnit('extra', 'period', item.label, {
          place: { zone: 'periods' },
        }),
      ),
      ...heroFileUnits('project-section', section.sectionUuid, audience, {
        banner: built.bannerMedia,
      }),
      ...contentUnits(built.content),
    ]),
  };
}

export async function eventDocument(
  eventUuid: string,
  audience: SearchAudience,
): Promise<SearchDocument | undefined> {
  const event = await THEI_SERVER.events.findByUuid(eventUuid);
  if (!event) return undefined;
  if (audience === 'public' && !canListPublicEntity(event.access, false))
    return undefined;
  const viewer = viewerOf(audience);
  const page = await buildPublicEvent(event, viewer);
  const period = page.periods.length
    ? coverDatedPeriods(page.periods)
    : undefined;
  const tags = tagUuidsOf('event', event.eventUuid);
  return {
    audience,
    kind: 'event',
    ref: `event:${event.eventUuid}`,
    publicRef: `event:${event.publicId}`,
    title: event.title,
    href: buildEventUrl(event.humanReadableSlug, event.publicId),
    ...(audience === 'owner'
      ? { editHref: `/admin/events/${event.eventUuid}/edit/` }
      : {}),
    ...(period
      ? {
          date: period.endDate,
          period: { startDate: period.startDate, endDate: period.endDate },
        }
      : {}),
    sort: sortOf(period, event.createdAt),
    visibleFrom:
      audience === 'public' && period ? dayArrives(period.startDate) : 0,
    ...accessOf(audience, event.access),
    summary: event.summary,
    media: page.media,
    tags,
    units: withFamilies([
      ...fieldUnit('title', 'title', event.title),
      ...fieldUnit('summary', 'summary', event.summary),
      ...names([event.humanReadableSlug, ...event.synonyms]),
      ...tagUnits(tags),
      ...page.periods.flatMap((item) =>
        fieldUnit('extra', 'period', item.label, {
          place: { zone: 'periods' },
        }),
      ),
      ...heroFileUnits('event', event.eventUuid, audience, {
        banner: page.bannerMedia,
      }),
      ...contentUnits(page.content),
      ...pageFileUnits(page.references.files, 'files'),
      ...referenceUnits(page.references),
      ...(await relationUnits('event', event.eventUuid, viewer)),
      ...noteUnits(page.notes),
    ]),
  };
}

export async function diaryDocument(
  diaryUuid: string,
  audience: SearchAudience,
): Promise<SearchDocument | undefined> {
  const entry = await THEI_SERVER.diary.findByUuid(diaryUuid);
  if (!entry) return undefined;
  if (audience === 'public' && !canListPublicEntity(entry.access, false))
    return undefined;
  const viewer = viewerOf(audience);
  const page = await buildPublicDiaryEntry(entry, viewer);
  return {
    audience,
    kind: 'diary-entry',
    ref: `diary-entry:${entry.diaryUuid}`,
    publicRef: `diary-entry:${entry.date}`,
    title: entry.date,
    href: buildDiaryUrl(entry.date),
    ...(audience === 'owner'
      ? { editHref: `/admin/diary/${entry.diaryUuid}/edit/` }
      : {}),
    date: entry.date,
    sort: { from: entry.date, to: entry.date, life: true },
    visibleFrom: audience === 'public' ? dayArrives(entry.date) : 0,
    ...accessOf(audience, entry.access),
    media: page.media,
    tags: [],
    units: withFamilies([
      ...contentUnits(page.content),
      ...(await relationUnits('diary-entry', entry.diaryUuid, viewer)),
      ...noteUnits(page.notes),
    ]),
  };
}

export async function pageDocument(
  pageUuid: string,
  audience: SearchAudience,
): Promise<SearchDocument | undefined> {
  const stored = await THEI_SERVER.pages.findByUuid(pageUuid);
  if (!stored) return undefined;
  if (audience === 'public' && !canListPublicEntity(stored.access, false))
    return undefined;
  const page = await buildPublicPage(stored, viewerOf(audience));
  return {
    audience,
    kind: 'page',
    ref: `page:${stored.pageUuid}`,
    publicRef: `page:${stored.slug}`,
    title: stored.title,
    href: buildPageUrl(stored.slug),
    ...(audience === 'owner'
      ? { editHref: `/admin/pages/${stored.pageUuid}/edit/` }
      : {}),
    sort: sortOf(undefined, stored.createdAt),
    visibleFrom: 0,
    ...accessOf(audience, stored.access),
    summary: stored.summary,
    media: page.iconMedia,
    tags: [],
    units: withFamilies([
      ...fieldUnit('title', 'title', stored.title),
      ...fieldUnit('summary', 'summary', stored.summary),
      ...names([stored.slug, ...stored.synonyms]),
      ...heroFileUnits('page', stored.pageUuid, audience, {
        icon: page.iconMedia,
      }),
      ...contentUnits(page.content),
      ...noteUnits(page.notes),
    ]),
  };
}

/**
 * The tags a reader may find: every tag for the owner, and for a stranger
 * the ones a public project or event carries — the tags whose page opens.
 */
export async function tagDocuments(
  audience: SearchAudience,
): Promise<SearchDocument[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const tags = db.select().from(schema.tags).all();
  let shown = tags;
  if (audience === 'public') {
    const carried = new Set<string>();
    const publicOwners = new Set([
      ...db
        .select()
        .from(schema.projects)
        .all()
        .filter((row) => canListPublicEntity(row.access, false))
        .map((row) => `project:${row.projectUuid}`),
      ...db
        .select()
        .from(schema.events)
        .all()
        .filter((row) => canListPublicEntity(row.access, false))
        .map((row) => `event:${row.eventUuid}`),
    ]);
    for (const usage of db.select().from(schema.tagUsages).all())
      if (publicOwners.has(`${usage.containerType}:${usage.containerId}`))
        carried.add(usage.tagUuid);
    shown = tags.filter((tag) => carried.has(tag.tagUuid));
  }
  const summaries = await buildPublicTagRows(shown);
  return shown.map((tag, at) => ({
    audience,
    kind: 'tag' as const,
    ref: `tag:${tag.tagUuid}`,
    publicRef: `tag:${tag.publicId}`,
    title: tag.title,
    href: buildTagUrl(tag.slug, tag.publicId),
    ...(audience === 'owner'
      ? { editHref: `/admin/tags/${tag.tagUuid}/edit/` }
      : {}),
    visibleFrom: 0,
    summary: tag.description,
    media: summaries[at]?.iconMedia,
    tags: [],
    units: [
      ...fieldUnit('title', 'title', tag.title),
      ...fieldUnit('summary', 'summary', tag.description),
      ...names([...(tag.synonyms ?? [])]),
    ],
  }));
}

export async function profileDocument(
  audience: SearchAudience,
): Promise<SearchDocument | undefined> {
  const profile = getProfile();
  if (!profile) return undefined;
  const identity = await getProfileIdentity();
  const viewer = viewerOf(audience);
  const about = await buildPublicContentData(
    'profile',
    PROFILE_ID,
    'profile-about',
    { type: 'profile', title: profile.displayName },
    audience === 'owner',
    viewer,
  );
  const links = await getProfileLinks(audience === 'owner');
  return {
    audience,
    kind: 'profile',
    ref: 'profile',
    title: profile.displayName,
    href: '/',
    ...(audience === 'owner' ? { editHref: '/admin/about/' } : {}),
    visibleFrom: 0,
    summary: profile.slogan,
    media: identity.avatarMedia,
    tags: [],
    units: [
      ...fieldUnit('title', 'title', profile.displayName),
      ...fieldUnit('summary', 'summary', profile.slogan),
      ...names([profile.nickname]),
      ...(profile.facts ?? []).flatMap((fact) =>
        fieldUnit('extra', 'fact', `${fact.name}: ${fact.value}`, {
          place: { zone: 'facts' },
        }),
      ),
      ...contentUnits(about),
      ...links.flatMap((link) =>
        [link.name, link.note].flatMap((words) =>
          fieldUnit('extra', 'link', words, {
            place: {
              relation: { title: link.name || link.title || link.url },
              link: link.url,
              zone: 'links',
            },
          }),
        ),
      ),
      ...statusUnits('profile', PROFILE_ID),
    ],
  };
}

/**
 * The file documents of some families, from the places documents built for
 * the same reader show them at (`file_places`): what a file says of itself —
 * its description — and its titles and captions at each place, and nothing
 * else. A stranger finds only files a page shows them. The owner also finds a
 * file of the library placed nowhere yet, by its description; `unplaced`
 * lists those families. A family left with nothing to say has no document.
 */
export function fileDocuments(
  audience: SearchAudience,
  places: Map<string, StoredFilePlace[]>,
  unplaced: Map<string, { assetUuid: string; description: string }> = new Map(),
): Map<string, SearchDocument | undefined> {
  const families = [...new Set([...places.keys(), ...unplaced.keys()])];
  const result = new Map<string, SearchDocument | undefined>();
  if (!families.length) return result;
  const firstAsset = (family: string) =>
    places.get(family)?.[0]?.assetUuid ?? unplaced.get(family)?.assetUuid;
  const assets = assetFamilies(
    families.flatMap((family) => {
      const uuid = firstAsset(family);
      return uuid ? [uuid] : [];
    }),
  );
  const descriptions = readFamilyDescriptions(families);
  for (const family of families) {
    const shown = places.get(family) ?? [];
    const asset = assets.get(firstAsset(family) ?? '');
    const description =
      shown.find((place) => place.description)?.description ??
      descriptions.get(family) ??
      unplaced.get(family)?.description ??
      '';
    if (!asset || (!shown.length && !description)) {
      result.set(family, undefined);
      continue;
    }
    const first = shown[0];
    const title = shown.find((place) => place.title)?.title ?? '';
    // A picture of some place is the file's, whichever place gave it.
    const media = shown.find((place) => place.media)?.media;
    result.set(family, {
      audience,
      kind: 'file',
      ref: `file:${family}`,
      title,
      // A file lives on the pages that show it: the first of them, at the
      // file. One no page shows yet, which only the owner finds, lives in
      // the library.
      shownAt: first ? first.placeName : THEI_SERVER.phrase.asset_library,
      ...(first?.sort ? { sort: first.sort } : {}),
      ...(first ? { publicRef: `file:${first.assetUuid}` } : {}),
      href:
        first?.href ??
        `/admin/assets/?q=${encodeURIComponent(title || description)}`,
      // Found once the earliest of its places is: a picture of a day still
      // to come waits with it.
      visibleFrom: shown.length
        ? Math.min(...shown.map((place) => place.visibleFrom))
        : 0,
      ...(description ? { summary: description } : {}),
      ...(media ? { media } : {}),
      file: {
        assetUuid: first?.assetUuid ?? firstAsset(family)!,
        type: asset.type,
        extension: asset.extension,
        size: asset.size,
      },
      tags: [],
      units: [
        ...fieldUnit(
          'title',
          'title',
          title,
          first ? { place: { href: first.href } } : {},
        ),
        ...fieldUnit(
          'summary',
          'file',
          description,
          first ? { place: { href: first.href } } : {},
        ),
        ...shown.flatMap((place) =>
          fieldUnit('text', 'caption', place.caption, {
            place: { href: place.href, relation: { title: place.placeTitle } },
          }),
        ),
      ],
    });
  }
  return result;
}

/** The families of the library with a description and no place yet. */
export function unplacedDescribedFiles(
  placed: Set<string>,
): Map<string, { assetUuid: string; description: string }> {
  const { rawDb } = THEI_SERVER.useDb();
  const rows = rawDb
    .prepare(
      'SELECT d.familyUuid, d.text, (SELECT assetUuid FROM assets a WHERE a.familyUuid = d.familyUuid ORDER BY a.touchedAt DESC LIMIT 1) AS assetUuid FROM "asset-descriptions" d',
    )
    .all() as { familyUuid: string; text: string; assetUuid: string | null }[];
  return new Map(
    rows
      .filter((row) => row.assetUuid && !placed.has(row.familyUuid))
      .map((row) => [
        row.familyUuid,
        { assetUuid: row.assetUuid!, description: row.text },
      ]),
  );
}

/** The address of a place in a document: its page, at its block. */
export function placeHref(
  document: Pick<SearchDocument, 'href'>,
  place: SearchPlace,
): string {
  if (place.href) return place.href;
  const page = place.section?.href ?? document.href;
  const hash = landingHash({
    ...(place.block ? { block: place.block } : {}),
    // The hero's picture is found by its part of the page, the rest by
    // the file.
    ...(place.file &&
    (place.block ||
      (place.zone && place.zone !== 'icon' && place.zone !== 'banner'))
      ? { file: place.file.assetUuid }
      : {}),
    ...(place.relation?.kind && place.relation.href
      ? { relation: { kind: place.relation.kind, href: place.relation.href } }
      : {}),
    ...(place.link ? { link: place.link } : {}),
    ...(place.status ? { status: place.status.date } : {}),
    ...(place.zone ? { zone: place.zone } : {}),
  });
  return hash ? `${page}#${hash}` : page;
}
