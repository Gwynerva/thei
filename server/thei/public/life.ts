import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import {
  buildLifeUrl,
  isLifePeriod,
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
} from './entities';

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
  const selected = index.points.slice(0, Math.min(20, Math.max(1, limit)));
  return Promise.all(selected.map((point) => hydrateLifePoint(point, isAdmin)));
}

function buildLifeIndex(): LifeIndex {
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

  const points = sortLifePoints(mergeLifeBoundaryPoints(raw));
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
  const visible = lifePointIsVisible(point.access, point.isPrivate, isAdmin);
  if (!visible) {
    return {
      date: point.date,
      entityKind: point.entityKind,
      transition: point.transition,
      ...(point.period ? { period: point.period } : {}),
      visibility: 'secret',
    };
  }
  const key = hash(`${point.identity}:${point.date}:${point.transition}`, 14);
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
    const summary = await buildPublicProjectSummary(project);
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
