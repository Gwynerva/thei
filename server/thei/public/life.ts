import { eq } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import {
  buildLifeUrl,
  isLifePeriod,
  lifeActivityDayTotal,
  type LifeActivityKind,
  type LifeActivityResponse,
  type LifeDay,
  type LifeEntityKind,
  type LifePoint,
  type LifeTransition,
  type LifeWindowResponse,
} from '#layers/thei/shared/life';
import {
  buildProjectChildUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import { hash } from '#layers/thei/shared/utils/hash';
import { getProfile, historyItem } from '../profile';
import {
  selectLifeRewindPoints,
  type LifeRewindResponse,
} from '#layers/thei/shared/life-rewind';
import { publicPagination } from './pagination';
import {
  lifePointIsVisible,
  mergeLifeBoundaryPoints,
  projectCreatedUtcDate,
  sortLifePoints,
} from '#layers/thei/shared/life-timeline';
import { buildPublicContentPreviewMedia } from './content';
import {
  buildPublicEventSummary,
  buildPublicPageIcon,
  buildPublicProjectReference,
  buildPublicProjectSummary,
  canListPublicEntity,
} from './entities';
import type { PublicProjectLink } from '#layers/thei/shared/api/public';
import { buildSecretReference, type SecretEntityKind } from './secret';

type RawPoint = {
  identity: string;
  date: string;
  entityKind: LifeEntityKind;
  transition: LifeTransition;
  sortTime: number;
  period?: import('#layers/thei/shared/date-range').DateRange;
  access: ProjectEventAccessLevel;
  isPrivate?: boolean;
  event?: any;
  page?: any;
  project?: any;
  stage?: any;
  section?: any;
  profileRecord?: {
    id: string;
    assetUuid: string | null;
    createdAt: number;
    text?: string;
    kind?: 'regular' | 'empty';
  };
};

type LifeIndex = {
  points: RawPoint[];
  dates: string[];
  pointsByDate: Map<string, RawPoint[]>;
};

export async function getLifeWindow(options: {
  period?: string;
  cursor?: string;
  direction?: 'around' | 'newer' | 'older';
  isAdmin: boolean;
}): Promise<LifeWindowResponse> {
  const index = buildLifeIndex();
  if (!index.dates.length && !options.period && !options.cursor)
    return { days: [], anchorDate: '', newestDate: '' };
  if (!index.dates.length)
    throw createError({ statusCode: 404, statusText: 'Life is empty' });
  const direction = options.direction ?? 'around';
  let anchorDate: string;
  if (options.cursor) {
    anchorDate = decodeLifeCursor(options.cursor);
    if (!index.pointsByDate.has(anchorDate))
      throw createError({ statusCode: 400, statusText: 'Invalid cursor' });
  } else if (options.period) {
    if (!isLifePeriod(options.period))
      throw createError({ statusCode: 404, statusText: 'Period not found' });
    anchorDate =
      index.dates.find((date) => date.startsWith(options.period!)) ?? '';
    if (!anchorDate)
      throw createError({ statusCode: 404, statusText: 'Period not found' });
  } else {
    anchorDate = index.dates[0]!;
  }

  const anchorIndex = index.dates.indexOf(anchorDate);
  let selectedDates: string[];
  if (direction === 'older') {
    selectedDates = index.dates.slice(anchorIndex + 1, anchorIndex + 9);
  } else if (direction === 'newer') {
    selectedDates = index.dates.slice(
      Math.max(0, anchorIndex - 8),
      anchorIndex,
    );
  } else {
    const start = Math.max(0, anchorIndex - 3);
    selectedDates = index.dates.slice(start, start + 8);
  }
  if (!selectedDates.length) selectedDates = [anchorDate];
  const days = await Promise.all(
    selectedDates.map((date) => hydrateLifeDay(index, date, options.isAdmin)),
  );
  const firstIndex = index.dates.indexOf(selectedDates[0]!);
  const lastIndex = index.dates.indexOf(selectedDates.at(-1)!);
  return {
    days,
    anchorDate,
    newestDate: index.dates[0]!,
    ...(firstIndex > 0
      ? { newerCursor: encodeLifeCursor(selectedDates[0]!) }
      : {}),
    ...(lastIndex < index.dates.length - 1
      ? { olderCursor: encodeLifeCursor(selectedDates.at(-1)!) }
      : {}),
  };
}

export async function getLatestLifePoints(limit: number, isAdmin: boolean) {
  const index = buildLifeIndex();
  const selected = selectLatestContentLifePoints(index.points, limit);
  return Promise.all(selected.map((point) => hydrateLifePoint(point, isAdmin)));
}

export function selectLatestContentLifePoints<
  T extends { entityKind: LifeEntityKind },
>(points: readonly T[], limit: number): T[] {
  const normalizedLimit = Math.min(20, Math.max(1, limit));
  return points
    .filter(
      (point) =>
        point.entityKind !== 'profile-avatar' &&
        point.entityKind !== 'profile-status',
    )
    .slice(0, normalizedLimit);
}

export async function getLifeRewind(options: {
  isAdmin: boolean;
  page?: unknown;
  pageSize?: number;
  now?: Date;
}): Promise<LifeRewindResponse> {
  const referenceDate = (options.now ?? new Date()).toISOString().slice(0, 10);
  const selected = selectLifeRewindPoints(buildRawLifePoints(), referenceDate);
  const pagination = publicPagination(
    selected.length,
    options.page,
    options.pageSize ?? 24,
  );
  const offset = (pagination.page - 1) * pagination.pageSize;
  return {
    referenceDate,
    ...pagination,
    items: await Promise.all(
      selected
        .slice(offset, offset + pagination.pageSize)
        .map(async ({ point, match }) => ({
          point: await hydrateLifePoint(point, options.isAdmin),
          match,
        })),
    ),
  };
}

function buildRawLifePoints(): RawPoint[] {
  const { db, schema } = THEI_SERVER.useDb();
  const [events, projects, pages, stages, sections, periods] = [
    db.select().from(schema.events).all(),
    db.select().from(schema.projects).all(),
    db.select().from(schema.pages).all(),
    db.select().from(schema.projectStages).all(),
    db.select().from(schema.projectContentSections).all(),
    db.select().from(schema.stagePeriods).all(),
  ];
  const projectById = new Map(
    projects.map((project) => [project.projectUuid, project]),
  );
  const eventById = new Map(events.map((event) => [event.eventUuid, event]));
  const stageById = new Map(stages.map((stage) => [stage.stageUuid, stage]));
  const raw: RawPoint[] = [];

  for (const period of periods) {
    if (period.stageType === 'event-stage') {
      const event = eventById.get(period.stageUuid);
      if (!event) continue;
      raw.push(
        boundaryPoint(
          'event',
          event.eventUuid,
          period.startDate,
          'started',
          event.access,
          period.sortOrder,
          {
            event,
          },
        ),
        boundaryPoint(
          'event',
          event.eventUuid,
          period.endDate,
          'ended',
          event.access,
          period.sortOrder,
          {
            event,
          },
        ),
      );
    } else {
      const stage = stageById.get(period.stageUuid);
      const project = stage ? projectById.get(stage.projectUuid) : undefined;
      if (!stage || !project) continue;
      raw.push(
        boundaryPoint(
          'project-stage',
          stage.stageUuid,
          period.startDate,
          'started',
          project.access,
          period.sortOrder,
          { stage, project, isPrivate: stage.isPrivate },
        ),
        boundaryPoint(
          'project-stage',
          stage.stageUuid,
          period.endDate,
          'ended',
          project.access,
          period.sortOrder,
          { stage, project, isPrivate: stage.isPrivate },
        ),
      );
    }
  }
  for (const project of projects) {
    const date = projectCreatedUtcDate(project.createdAt);
    raw.push({
      identity: `project:${project.projectUuid}`,
      date,
      entityKind: 'project',
      transition: 'created',
      sortTime: project.createdAt,
      access: project.access,
      project,
    });
  }
  for (const page of pages) {
    raw.push({
      identity: `page:${page.pageUuid}`,
      date: projectCreatedUtcDate(page.createdAt),
      entityKind: 'page',
      transition: 'created',
      sortTime: page.createdAt,
      access: page.access,
      page,
    });
  }
  for (const section of sections) {
    const project = projectById.get(section.projectUuid);
    if (!project) continue;
    raw.push({
      identity: `project-section:${section.sectionUuid}`,
      date: projectCreatedUtcDate(section.createdAt),
      entityKind: 'project-section',
      transition: 'created',
      sortTime: section.createdAt,
      access: project.access,
      isPrivate: section.isPrivate,
      project,
      section,
    });
  }

  for (const [entityKind, records] of [
    ['profile-avatar', db.select().from(schema.profileAvatars).all()],
    ['profile-status', db.select().from(schema.profileStatuses).all()],
  ] as const) {
    for (const record of records)
      raw.push({
        identity: `${entityKind}:${record.id}`,
        entityKind,
        transition: 'created',
        date: new Date(record.createdAt).toISOString().slice(0, 10),
        sortTime: record.createdAt,
        access: ProjectEventAccessLevel.Public,
        profileRecord: record,
      });
  }
  return raw;
}

function buildLifeIndex(): LifeIndex {
  const points = sortLifePoints(mergeLifeBoundaryPoints(buildRawLifePoints()));
  const pointsByDate = new Map<string, RawPoint[]>();
  for (const point of points) {
    const list = pointsByDate.get(point.date) ?? [];
    list.push(point);
    pointsByDate.set(point.date, list);
  }
  return {
    points,
    dates: Array.from(pointsByDate.keys()).sort().reverse(),
    pointsByDate,
  };
}

function boundaryPoint(
  entityKind: LifeEntityKind,
  id: string,
  date: string,
  transition: 'started' | 'ended',
  access: ProjectEventAccessLevel,
  periodSortOrder: number,
  details: Partial<RawPoint>,
): RawPoint {
  return {
    identity: `${entityKind}:${id}:period:${periodSortOrder}`,
    date,
    entityKind,
    transition,
    sortTime: Date.parse(
      `${date}T${transition === 'ended' ? '23:59:59.999' : '00:00:00.000'}Z`,
    ),
    access,
    ...details,
  };
}

async function hydrateLifeDay(
  index: LifeIndex,
  date: string,
  isAdmin: boolean,
): Promise<LifeDay> {
  return {
    date,
    points: await Promise.all(
      (index.pointsByDate.get(date) ?? []).map((point) =>
        hydrateLifePoint(point, isAdmin),
      ),
    ),
  };
}

async function hydrateLifePoint(
  point: RawPoint,
  isAdmin: boolean,
): Promise<LifePoint> {
  const key = hash(`${point.identity}:${point.date}:${point.transition}`, 14);
  const visible = lifePointIsVisible(point.access, point.isPrivate, isAdmin);
  if (!visible) {
    const secret = buildSecretReference(
      point.entityKind as SecretEntityKind,
      secretPointUuid(point),
    );
    return {
      key,
      date: point.date,
      entityKind: point.entityKind,
      transition: point.transition,
      ...(point.period ? { period: point.period } : {}),
      visibility: 'secret',
      title: secret.title,
      summary: secret.summary,
      media: secret.iconMedia,
    };
  }
  if (
    point.entityKind === 'profile-avatar' ||
    point.entityKind === 'profile-status'
  ) {
    if (point.entityKind === 'profile-avatar') {
      const record = await historyItem(point.profileRecord!, 'avatars');
      return {
        key,
        date: point.date,
        entityKind: point.entityKind,
        transition: point.transition,
        visibility: 'visible',
        title: getProfile().displayName,
        summary: '',
        href: '/#avatars',
        media: record.media,
      };
    }
    const statusRecord = point.profileRecord! as {
      id: string;
      assetUuid: string | null;
      createdAt: number;
      text: string;
      kind: 'regular' | 'empty';
    };
    const record = await historyItem(statusRecord, 'statuses');
    return {
      key,
      date: point.date,
      entityKind: point.entityKind,
      transition: point.transition,
      visibility: 'visible',
      title: getProfile().displayName,
      summary: record.text,
      href: '/#statuses',
      media: record.media,
      profileStatusKind: record.kind,
    };
  }
  if (point.entityKind === 'event') {
    const event = point.event!;
    const summary = await buildPublicEventSummary(event, isAdmin);
    return {
      key,
      date: point.date,
      ...(point.period ? { period: point.period } : {}),
      entityKind: point.entityKind,
      transition: point.transition,
      visibility: 'visible',
      title: event.title,
      summary: event.summary,
      href: buildEventUrl(event.humanReadableSlug, event.publicId),
      media: summary.media,
      tags: summary.tags,
      relatedProjects: summary.relatedProjects,
    };
  }
  if (point.entityKind === 'page') {
    const page = point.page!;
    return {
      key,
      date: point.date,
      entityKind: point.entityKind,
      transition: point.transition,
      visibility: 'visible',
      title: page.title,
      summary: page.summary,
      href: buildPageUrl(page.slug),
      media: await buildPublicPageIcon(page),
    };
  }
  const project = point.project!;
  if (point.entityKind === 'project') {
    const summary = await buildPublicProjectSummary(project, isAdmin);
    return {
      key,
      date: point.date,
      ...(point.period ? { period: point.period } : {}),
      entityKind: point.entityKind,
      transition: point.transition,
      visibility: 'visible',
      title: project.title,
      summary: project.summary,
      href: buildProjectUrl(project.humanReadableSlug, project.publicId),
      media: summary.media,
      tags: summary.tags,
    };
  }
  if (point.entityKind === 'project-stage') {
    const stage = point.stage!;
    const [media, projectReference] = await Promise.all([
      buildPublicContentPreviewMedia(
        'project-stage',
        stage.stageUuid,
        'project-stage-body',
        { type: 'project', ...project },
        isAdmin,
      ),
      buildPublicProjectReference(project),
    ]);
    return {
      key,
      date: point.date,
      ...(point.period ? { period: point.period } : {}),
      entityKind: point.entityKind,
      transition: point.transition,
      visibility: 'visible',
      title: stage.title,
      summary: stage.summary,
      href: buildProjectChildUrl(
        project.humanReadableSlug,
        project.publicId,
        'stages',
        stage.humanReadableSlug,
        stage.publicId,
      ),
      media,
      project: projectReference,
    };
  }
  const section = point.section!;
  const [media, projectReference] = await Promise.all([
    buildPublicContentPreviewMedia(
      'project-section',
      section.sectionUuid,
      'project-section-body',
      { type: 'project', ...project },
      isAdmin,
    ),
    buildPublicProjectReference(project),
  ]);
  return {
    key,
    date: point.date,
    ...(point.period ? { period: point.period } : {}),
    entityKind: point.entityKind,
    transition: point.transition,
    visibility: 'visible',
    title: section.title,
    summary: section.summary,
    href: buildProjectChildUrl(
      project.humanReadableSlug,
      project.publicId,
      'sections',
      section.humanReadableSlug,
      section.publicId,
    ),
    media,
    project: projectReference,
  };
}

function secretPointUuid(point: RawPoint): string {
  if (point.entityKind === 'event') return point.event!.eventUuid;
  if (point.entityKind === 'page') return point.page!.pageUuid;
  if (point.entityKind === 'project-stage') return point.stage!.stageUuid;
  if (point.entityKind === 'project-section') return point.section!.sectionUuid;
  return point.project!.projectUuid;
}

export function encodeLifeCursor(date: string) {
  return Buffer.from(`life:v1:${date}`).toString('base64url');
}

export function decodeLifeCursor(cursor: string) {
  try {
    const value = Buffer.from(cursor, 'base64url').toString();
    const match = /^life:v1:(\d{4}-\d{2}-\d{2})$/.exec(value);
    if (match && isLifePeriod(match[1]!)) return match[1]!;
  } catch {}
  throw createError({ statusCode: 400, statusText: 'Invalid cursor' });
}

export { buildLifeUrl };

/**
 * One year of the timeline as per-day counts, for the activity grid.
 *
 * Counts are of timeline points, the same things the feed shows, so a day with
 * two events and a stage that ended counts three. What the visitor may not see
 * is counted as `secret` — the feed already admits that something happened on
 * that day without saying what.
 */
export async function getLifeActivity(options: {
  year?: number;
  isAdmin: boolean;
}): Promise<LifeActivityResponse> {
  const index = buildLifeIndex();
  const years = [
    ...new Set(index.dates.map((date) => Number(date.slice(0, 4)))),
  ].sort((a, b) => b - a);
  const requested = options.year;
  // Without a year asked for, the grid opens on the year being lived: a site
  // holding an event already scheduled for next year should still open on
  // this one. Only a year with nothing in it falls back to the latest one.
  const current = new Date().getUTCFullYear();
  const year =
    requested && years.includes(requested)
      ? requested
      : (requested ??
        (years.includes(current) ? current : (years[0] ?? current)));

  const days: LifeActivityResponse['days'] = {};
  let max = 0;
  const prefix = `${year}-`;
  for (const [date, points] of index.pointsByDate) {
    if (!date.startsWith(prefix)) continue;
    const counts: Partial<Record<LifeActivityKind, number>> = {};
    for (const point of points) {
      const kind: LifeActivityKind = lifePointIsVisible(
        point.access,
        point.isPrivate,
        options.isAdmin,
      )
        ? point.entityKind
        : 'secret';
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    days[date] = counts;
    max = Math.max(max, lifeActivityDayTotal(counts));
  }

  return {
    year,
    years,
    days,
    max,
    projects: await buildLifeActivityProjects(year, options.isAdmin),
  };
}

/**
 * Projects the year was spent on.
 *
 * Measured by stage periods rather than by when the project page happened to
 * be written: a project started years ago and worked on all year belongs to
 * this year, and one merely created in January does not.
 */
async function buildLifeActivityProjects(
  year: number,
  isAdmin: boolean,
): Promise<PublicProjectLink[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const periods = db
    .select()
    .from(schema.stagePeriods)
    .where(eq(schema.stagePeriods.stageType, 'project-stage'))
    .all();
  const stages = db.select().from(schema.projectStages).all();
  const stageById = new Map(stages.map((stage) => [stage.stageUuid, stage]));

  const ordered: { projectUuid: string; latest: string }[] = [];
  const seen = new Map<string, number>();
  for (const period of periods) {
    const from = period.startDate;
    const to = period.endDate ?? period.startDate;
    if (!from || from > end || to < start) continue;
    const stage = stageById.get(period.stageUuid);
    if (!stage) continue;
    const existing = seen.get(stage.projectUuid);
    if (existing === undefined) {
      seen.set(stage.projectUuid, ordered.length);
      ordered.push({ projectUuid: stage.projectUuid, latest: to });
    } else {
      const entry = ordered[existing]!;
      if (to > entry.latest) entry.latest = to;
    }
  }

  ordered.sort((a, b) => b.latest.localeCompare(a.latest));
  const links = await Promise.all(
    ordered.map(async ({ projectUuid }) => {
      const project = await THEI_SERVER.projects.findByUuid(projectUuid);
      if (!project) return undefined;
      return canListPublicEntity(project.access, isAdmin)
        ? await buildPublicProjectReference(project)
        : buildSecretReference('project', project.projectUuid);
    }),
  );
  return links.filter((link) => link !== undefined);
}

/** One day, hydrated, for the panel under the activity grid. */
export async function getLifeDay(
  date: string,
  isAdmin: boolean,
): Promise<LifeDay> {
  const index = buildLifeIndex();
  return hydrateLifeDay(index, date, isAdmin);
}
