import { eq } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { diaryContentExcerpt } from '#layers/thei/shared/diary-text';
import {
  buildLifeUrl,
  isLifeDay,
  lifeArrivalCutoff,
  lifeFilterIncludes,
  lifeFilterKinds,
  LIFE_ACTIVITY_TOTAL_KINDS,
  LIFE_SCOPE_LIFE,
  lifeActivityDayTotal,
  type LifeActivityKind,
  type LifeActivityResponse,
  type LifeDay,
  type LifeEntityKind,
  type LifePoint,
  type LifeFilter,
  type LifeScope,
  type LifeTransition,
  type LifeWindowResponse,
} from '#layers/thei/shared/life';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import { hash } from '#layers/thei/shared/utils/hash';
import { getProfile, historyItem } from '../profile';
import { statusHistoryItem } from '../statuses';
import { PROFILE_ID } from '#layers/thei/shared/profile';
import {
  selectLifeRewindPoints,
  type LifeRewindResponse,
} from '#layers/thei/shared/life-rewind';
import { paginate } from '#layers/thei/shared/pagination';
import { PUBLIC_PAGE_SIZE } from './pagination';
import {
  isApproximateDate,
  normalizeDatePrecisionInfo,
  type DatePrecisionInfo,
} from '#layers/thei/shared/date-precision';
import {
  lifePointIsVisible,
  mergeLifeBoundaryPoints,
  projectCreatedUtcDate,
  sortLifePoints,
} from '#layers/thei/shared/life-timeline';
import { buildPublicEntityPreviewMedia } from './content';
import { buildPublicSectionCardMedia } from '../entity-banner';
import {
  buildPublicEventSummary,
  buildPublicPageIcon,
  buildPublicEntityReference,
  buildPublicProjectSummary,
} from './entities';
import { isPublicSecret } from '#layers/thei/shared/api/public';
import { buildSecretReference, type SecretEntityKind } from './secret';
import type { ShareGrantOwner } from '#layers/thei/shared/share-link';
import {
  opensGrantOwner,
  siteViewer,
  type PublicViewer,
} from '../access-links/viewer';
import {
  countLifeActivityEntities,
  type LifeActivityEntityPoint,
} from './life-activity';
import { utcDayOf } from '#layers/thei/shared/date-range';

type RawPoint = {
  identity: string;
  date: string;
  entityKind: LifeEntityKind;
  transition: LifeTransition;
  sortTime: number;
  period?: import('#layers/thei/shared/date-range').DateRange;
  precision?: DatePrecisionInfo;
  /** The owner's name for the period this point bounds, when they gave one. */
  periodLabel?: string;
  ongoing?: boolean;
  access: ProjectEventAccessLevel;
  isPrivate?: boolean;
  event?: any;
  page?: any;
  project?: any;
  /**
   * Every project this point belongs to, for scoping.
   *
   * A section belongs to one project; an event may relate to several; a status
   * belongs to whichever project owns it. Kept separate from `project`, which
   * is the project shown on the card.
   */
  projectUuids?: string[];
  section?: any;
  diaryEntry?: any;
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
  /**
   * Cards a period's start and end were folded into, by the day the period
   * began. A folded card stands on its last day; its first day still holds
   * it for the activity grid, the day panel and an address naming that day.
   */
  startedOn: Map<string, RawPoint[]>;
  /** Days a shown period runs on from to the next newer day (`LifeDay.bridged`). */
  bridged: Set<string>;
  /** The kinds the scope holds at all, whatever the filter hides. */
  kinds: LifeEntityKind[];
  /**
   * The address of the project a scoped chronology belongs to. Its own cards
   * do not name it again — on the project's page, "part of this project" and
   * "related to this project" are both things the reader already knows.
   */
  ownHref?: string;
};

export type LifeQuery = {
  scope?: LifeScope;
  filter?: LifeFilter;
  /**
   * Who is reading. Each point asks it about the entity it belongs to, so a
   * project's share link opens the project's own points and nothing else.
   */
  viewer: PublicViewer;
  /** The moment the chronology is read at; tests bring their own. */
  now?: Date;
};

export async function getLifeWindow(
  options: LifeQuery & {
    date?: string;
    cursor?: string;
    direction?: 'around' | 'newer' | 'older';
  },
): Promise<LifeWindowResponse> {
  const index = buildLifeIndex(options.scope, options.filter, options.now);
  if (!index.dates.length && !options.date && !options.cursor)
    return { days: [], anchorDate: '', newestDate: '', kinds: index.kinds };
  if (!index.dates.length)
    throw createError({ statusCode: 404, statusText: 'Life is empty' });
  const direction = options.direction ?? 'around';
  let anchorDate: string;
  if (options.cursor) {
    anchorDate = decodeLifeCursor(options.cursor);
    if (!index.pointsByDate.has(anchorDate))
      throw createError({ statusCode: 400, statusText: 'Invalid cursor' });
  } else if (options.date) {
    if (!isLifeDay(options.date))
      throw createError({ statusCode: 404, statusText: 'Day not found' });
    // A day a folded period began on opens at that period's card; a day
    // nothing happened on, or one the filter hides, opens at the nearest day
    // that does hold something rather than 404ing: a shared link stays
    // useful after its day is filtered away.
    const folded = index.startedOn.get(options.date);
    anchorDate = index.pointsByDate.has(options.date)
      ? options.date
      : folded
        ? folded.map((point) => point.date).sort()[0]!
        : (index.dates.find((date) => date <= options.date!) ??
          index.dates.at(-1)!);
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
    selectedDates.map((date) => hydrateLifeDay(index, date, options.viewer)),
  );
  const firstIndex = index.dates.indexOf(selectedDates[0]!);
  const lastIndex = index.dates.indexOf(selectedDates.at(-1)!);
  return {
    days,
    anchorDate,
    newestDate: index.dates[0]!,
    kinds: index.kinds,
    ...(firstIndex > 0
      ? { newerCursor: encodeLifeCursor(selectedDates[0]!) }
      : {}),
    ...(lastIndex < index.dates.length - 1
      ? { olderCursor: encodeLifeCursor(selectedDates.at(-1)!) }
      : {}),
  };
}

export async function getLatestLifePoints(limit: number, options: LifeQuery) {
  const index = buildLifeIndex(options.scope, options.filter, options.now);
  const selected = selectLatestContentLifePoints(
    index.points,
    limit,
    options.scope,
  );
  return Promise.all(
    selected.map(async (point) =>
      withoutOwnProject(
        await hydrateLifePoint(point, options.viewer),
        index.ownHref,
      ),
    ),
  );
}

/**
 * How many points a chronology holds, secrets included.
 *
 * Used for the counter on a project's "Chronology" tab. A secret is counted
 * because the feed behind the tab shows it too — under a codename — and a
 * number that disagrees with what the tab opens onto reads as a bug.
 */
export function countLifePoints(options: Omit<LifeQuery, 'viewer'>): number {
  return buildLifeIndex(options.scope, options.filter, options.now).points
    .length;
}

/**
 * How many points each year of a chronology holds, secrets included for the
 * same reason as `countLifePoints`: the feed shows them too. Every year from
 * the first to the last is present, an empty one with a count of 0, so a
 * chart drawn from it keeps the gaps a life had.
 */
export function countLifePointsByYear(
  options: Omit<LifeQuery, 'viewer'>,
): { year: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const point of buildLifeIndex(options.scope, options.filter, options.now)
    .points) {
    const year = Number(point.date.slice(0, 4));
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  if (!counts.size) return [];
  const years = [...counts.keys()];
  const first = Math.min(...years);
  const last = Math.max(...years);
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    year: first + index,
    count: counts.get(first + index) ?? 0,
  }));
}

/**
 * The newest points worth putting on a summary block.
 *
 * On the home page the person's own avatar and status changes are left out —
 * they have their own blocks right there. Read for one project, its statuses
 * stay: they are points of the project's own.
 */
export function selectLatestContentLifePoints<
  T extends { entityKind: LifeEntityKind },
>(
  points: readonly T[],
  limit: number,
  scope: LifeScope = LIFE_SCOPE_LIFE,
): T[] {
  const normalizedLimit = Math.min(20, Math.max(1, limit));
  return points
    .filter(
      (point) =>
        point.entityKind !== 'profile-avatar' &&
        (scope.kind === 'project' || point.entityKind !== 'profile-status'),
    )
    .slice(0, normalizedLimit);
}

export async function getLifeRewind(options: {
  isAdmin: boolean;
  page?: unknown;
  pageSize?: number;
  now?: Date;
}): Promise<LifeRewindResponse> {
  const referenceDate = utcDayOf(options.now ?? new Date());
  const selected = selectLifeRewindPoints(buildRawLifePoints(), referenceDate);
  const paged = paginate(
    selected,
    options.page,
    options.pageSize ?? PUBLIC_PAGE_SIZE,
  );
  return {
    referenceDate,
    ...paged,
    items: await Promise.all(
      paged.items.map(async ({ point, match }) => ({
        point: await hydrateLifePoint(point, siteViewer(options.isAdmin)),
        match,
      })),
    ),
  };
}

/**
 * Every point of every entity. Given the day a chronology ends at, a period
 * that has not started yet holds no point, one still running holds only its
 * start, marked ongoing, and nothing else dated later is there; without it —
 * for the Rewind, which only looks at years gone by — everything is.
 */
function buildRawLifePoints(cutoff?: string): RawPoint[] {
  const { db, schema } = THEI_SERVER.useDb();
  const [events, projects, pages, sections, periods] = [
    db.select().from(schema.events).all(),
    db.select().from(schema.projects).all(),
    db.select().from(schema.pages).all(),
    db.select().from(schema.projectContentSections).all(),
    db.select().from(schema.periods).all(),
  ];
  const projectById = new Map(
    projects.map((project) => [project.projectUuid, project]),
  );
  const eventById = new Map(events.map((event) => [event.eventUuid, event]));
  const sectionById = new Map(
    sections.map((section) => [section.sectionUuid, section]),
  );
  const datedSections = new Set<string>();
  // An event belongs to a project's chronology through its relations, which is
  // the same list the project page already shows as related events.
  const projectsByEvent = new Map<string, string[]>();
  // A diary entry reaches a project's chronology the same way an event does:
  // through the relation the author drew between them.
  const projectsByDiaryEntry = new Map<string, string[]>();
  for (const row of db.select().from(schema.entityRelations).all()) {
    // Either end may be the project: a relation is drawn from whichever side
    // the author was on.
    const ends = [
      { type: row.firstType, id: row.firstId },
      { type: row.secondType, id: row.secondId },
    ];
    const project = ends.find((end) => end.type === 'project');
    const other = ends.find((end) => end.type !== 'project');
    if (!project || !other) continue;
    const byEntity =
      other.type === 'event' ? projectsByEvent : projectsByDiaryEntry;
    const list = byEntity.get(other.id) ?? [];
    list.push(project.id);
    byEntity.set(other.id, list);
  }
  const raw: RawPoint[] = [];

  for (const period of periods) {
    if (cutoff && period.startDate > cutoff) continue;
    const ongoing = Boolean(cutoff && period.endDate > cutoff);
    if (period.ownerType === 'event') {
      const event = eventById.get(period.ownerId);
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
            projectUuids: projectsByEvent.get(event.eventUuid) ?? [],
            ...periodPrecision(period),
            ...periodLabel(period),
            ...periodSpan(period),
            ...(ongoing ? { ongoing } : {}),
          },
        ),
      );
      if (!ongoing)
        raw.push(
          boundaryPoint(
            'event',
            event.eventUuid,
            period.endDate,
            'ended',
            event.access,
            period.sortOrder,
            {
              event,
              projectUuids: projectsByEvent.get(event.eventUuid) ?? [],
              ...periodPrecision(period),
              ...periodLabel(period),
              ...periodSpan(period),
            },
          ),
        );
    } else {
      const section = sectionById.get(period.ownerId);
      const project = section
        ? projectById.get(section.projectUuid)
        : undefined;
      if (!section || !project) continue;
      datedSections.add(section.sectionUuid);
      raw.push(
        boundaryPoint(
          'project-section',
          section.sectionUuid,
          period.startDate,
          'started',
          project.access,
          period.sortOrder,
          {
            section,
            project,
            isPrivate: section.isPrivate,
            projectUuids: [project.projectUuid],
            ...periodPrecision(period),
            ...periodLabel(period),
            ...periodSpan(period),
            ...(ongoing ? { ongoing } : {}),
          },
        ),
      );
      if (!ongoing)
        raw.push(
          boundaryPoint(
            'project-section',
            section.sectionUuid,
            period.endDate,
            'ended',
            project.access,
            period.sortOrder,
            {
              section,
              project,
              isPrivate: section.isPrivate,
              projectUuids: [project.projectUuid],
              ...periodPrecision(period),
              ...periodLabel(period),
              ...periodSpan(period),
            },
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
      projectUuids: [project.projectUuid],
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
  // A section without dates lands on the day it was written; a dated one is
  // on the timeline by its periods instead.
  for (const section of sections) {
    if (datedSections.has(section.sectionUuid)) continue;
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
      projectUuids: [project.projectUuid],
    });
  }

  for (const entry of db.select().from(schema.diaryEntries).all()) {
    raw.push({
      identity: `diary-entry:${entry.diaryUuid}`,
      date: entry.date,
      entityKind: 'diary-entry',
      transition: 'created',
      // Two entries never share a day, so the day itself orders them; the
      // hour they happened to be typed at says nothing worth sorting by.
      sortTime: Date.parse(`${entry.date}T12:00:00.000Z`),
      access: entry.access,
      diaryEntry: entry,
      projectUuids: projectsByDiaryEntry.get(entry.diaryUuid) ?? [],
    });
  }

  for (const record of db.select().from(schema.profileAvatars).all()) {
    raw.push({
      identity: `profile-avatar:${record.id}`,
      entityKind: 'profile-avatar',
      transition: 'created',
      date: utcDayOf(record.createdAt),
      sortTime: record.createdAt,
      access: ProjectEventAccessLevel.Public,
      profileRecord: record,
    });
  }

  // Statuses of both kinds share one point kind: the card tells them apart by
  // whether it has a project to name, and a reader filtering "statuses" on a
  // project's chronology means the project's own.
  for (const record of db.select().from(schema.statuses).all()) {
    const project =
      record.ownerType === 'project'
        ? projectById.get(record.ownerId)
        : undefined;
    if (record.ownerType === 'project' && !project) continue;
    raw.push({
      identity: `profile-status:${record.id}`,
      entityKind: 'profile-status',
      transition: 'created',
      // The day the owner gave it; the moment written orders that day's
      // statuses the way their own history does.
      date: record.date,
      sortTime: record.createdAt,
      access: project?.access ?? ProjectEventAccessLevel.Public,
      profileRecord: record,
      ...(project
        ? { project, projectUuids: [project.projectUuid] }
        : { projectUuids: [] }),
    });
  }
  return cutoff ? raw.filter((point) => point.date <= cutoff) : raw;
}

/**
 * Every point a reader may see, narrowed to one scope and one filter.
 *
 * A period's start and end are folded into one card on the scope as a whole,
 * before the filter: what a feed holds, and what it counts, never depends on
 * the kinds a reader picked. The filter comes before the index is built, not
 * after: the window walks `dates`, so a day whose only points were filtered
 * out has to be gone by then or the feed shows an empty segment.
 */
function buildLifeIndex(
  scope: LifeScope = LIFE_SCOPE_LIFE,
  filter?: LifeFilter,
  now: Date | number = Date.now(),
): LifeIndex {
  const cutoff = lifeArrivalCutoff(now);
  const scoped = buildRawLifePoints(cutoff).filter(
    (point) =>
      scope.kind !== 'project' ||
      (point.projectUuids?.includes(scope.projectUuid) ?? false),
  );
  const points = sortLifePoints(
    mergeLifeBoundaryPoints(scoped).filter((point) =>
      lifeFilterIncludes(filter, point.entityKind),
    ),
  );
  const pointsByDate = new Map<string, RawPoint[]>();
  const startedOn = new Map<string, RawPoint[]>();
  for (const point of points) {
    const list = pointsByDate.get(point.date) ?? [];
    list.push(point);
    pointsByDate.set(point.date, list);
    const start = foldedStart(point);
    if (start) startedOn.set(start, [...(startedOn.get(start) ?? []), point]);
  }
  const dates = Array.from(pointsByDate.keys()).sort().reverse();
  return {
    points,
    dates,
    pointsByDate,
    startedOn,
    bridged: bridgedDays(points, dates, cutoff),
    kinds: lifeFilterKinds(scope).filter((kind) =>
      scoped.some((point) => point.entityKind === kind),
    ),
    ownHref: scopeProjectHref(scope),
  };
}

/**
 * The days a period the feed shows runs on from to the next newer day it
 * holds — what a cut in the rail between them would wrongly call a pause. A
 * running period reaches as far as the feed does.
 */
function bridgedDays(
  points: RawPoint[],
  newestFirst: string[],
  cutoff: string,
): Set<string> {
  const reaches = points
    .flatMap((point) =>
      point.period &&
      (point.transition === 'started' || point.transition === 'occurred')
        ? [
            {
              start: point.period.startDate,
              end:
                point.period.endDate > cutoff ? cutoff : point.period.endDate,
            },
          ]
        : [],
    )
    .sort((left, right) => left.start.localeCompare(right.start));
  const bridged = new Set<string>();
  const days = [...newestFirst].reverse();
  let next = 0;
  let reach = '';
  for (let index = 0; index < days.length - 1; index++) {
    const day = days[index]!;
    while (next < reaches.length && reaches[next]!.start <= day) {
      if (reaches[next]!.end > reach) reach = reaches[next]!.end;
      next++;
    }
    if (reach >= days[index + 1]!) bridged.add(day);
  }
  return bridged;
}

/** The first day of a card a period's start and end were folded into. */
function foldedStart(point: RawPoint): string | undefined {
  return point.transition === 'occurred' &&
    point.period &&
    point.period.startDate !== point.date
    ? point.period.startDate
    : undefined;
}

function scopeProjectHref(scope: LifeScope): string | undefined {
  if (scope.kind !== 'project') return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const project = db
    .select({
      humanReadableSlug: schema.projects.humanReadableSlug,
      publicId: schema.projects.publicId,
    })
    .from(schema.projects)
    .where(eq(schema.projects.projectUuid, scope.projectUuid))
    .get();
  return project
    ? buildProjectUrl(project.humanReadableSlug, project.publicId)
    : undefined;
}

/** Drops the scope's own project from a card that would name it again. */
function withoutOwnProject(point: LifePoint, ownHref?: string): LifePoint {
  if (!ownHref || point.visibility !== 'visible') return point;
  const { project, relatedEntities, ...rest } = point;
  const related = relatedEntities?.filter(
    (entity) => isPublicSecret(entity) || entity.href !== ownHref,
  );
  return {
    ...rest,
    ...(project && project.href !== ownHref ? { project } : {}),
    ...(related?.length ? { relatedEntities: related } : {}),
  };
}

/**
 * The whole of a period, on each card of it: a start knows where it ends,
 * an end where it began. A single day is its own date and needs none.
 */
function periodSpan(period: { startDate: string; endDate: string }): {
  period?: { startDate: string; endDate: string };
} {
  return period.startDate === period.endDate
    ? {}
    : { period: { startDate: period.startDate, endDate: period.endDate } };
}

/** A period's name, carried on its points only when it has one. */
function periodLabel(period: { label: string }): { periodLabel?: string } {
  return period.label ? { periodLabel: period.label } : {};
}

/** A period's doubt, carried on its points only when there is any. */
function periodPrecision(period: Partial<DatePrecisionInfo>): {
  precision?: DatePrecisionInfo;
} {
  const precision = normalizeDatePrecisionInfo(period);
  return isApproximateDate(precision.precision) ? { precision } : {};
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
  viewer: PublicViewer,
  points = index.pointsByDate.get(date) ?? [],
): Promise<LifeDay> {
  return {
    date,
    ...(index.bridged.has(date) ? { bridged: true as const } : {}),
    points: await Promise.all(
      points.map(async (point) =>
        withoutOwnProject(await hydrateLifePoint(point, viewer), index.ownHref),
      ),
    ),
  };
}

/** The entity whose share link opens a point: the project for its parts and statuses. */
function pointGrantOwner(point: RawPoint): ShareGrantOwner | undefined {
  switch (point.entityKind) {
    case 'event':
      return { entityType: 'event', entityId: point.event!.eventUuid };
    case 'diary-entry':
      return {
        entityType: 'diary-entry',
        entityId: point.diaryEntry!.diaryUuid,
      };
    case 'page':
      return { entityType: 'page', entityId: point.page!.pageUuid };
    case 'profile-avatar':
      return undefined;
    default:
      return point.project
        ? { entityType: 'project', entityId: point.project.projectUuid }
        : undefined;
  }
}

function pointIsVisible(point: RawPoint, viewer: PublicViewer): boolean {
  return lifePointIsVisible(
    point.access,
    point.isPrivate,
    opensGrantOwner(viewer, pointGrantOwner(point)),
  );
}

/**
 * The kind a hidden point is presented as. A project's status is as secret as
 * its project and goes by the project's codename.
 */
function secretPointKind(point: RawPoint): SecretEntityKind {
  return point.entityKind === 'profile-status'
    ? 'project'
    : (point.entityKind as SecretEntityKind);
}

async function hydrateLifePoint(
  point: RawPoint,
  viewer: PublicViewer,
): Promise<LifePoint> {
  const key = hash(`${point.identity}:${point.date}:${point.transition}`, 14);
  // The owner's side of this point: the site-wide role, or a link to the
  // entity it belongs to. Everything else on the card stays the reader's.
  const opens = opensGrantOwner(viewer, pointGrantOwner(point));
  const visible = pointIsVisible(point, viewer);
  if (!visible) {
    const secret = buildSecretReference(
      secretPointKind(point),
      secretPointUuid(point),
    );
    return {
      key,
      date: point.date,
      entityKind: point.entityKind,
      transition: point.transition,
      // A running period's end is still to come, and the owner's to tell.
      ...(point.period && !point.ongoing ? { period: point.period } : {}),
      // The level of doubt is about the date the card already shows; the
      // owner's note about it is content, and a secret keeps its content.
      ...(point.precision
        ? { precision: { ...point.precision, precisionNote: '' } }
        : {}),
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
      const record = await historyItem(point.profileRecord!);
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
      date: string;
      createdAt: number;
      text: string;
      kind: 'regular' | 'empty';
    };
    // A project's status is titled and linked by its project; the person's own
    // keeps the profile's name and the block on the home page.
    const owner = point.project;
    const record = await statusHistoryItem(
      statusRecord,
      owner
        ? { type: 'project', id: owner.projectUuid }
        : { type: 'profile', id: PROFILE_ID },
      viewer.isAdmin,
      owner,
    );
    return {
      key,
      date: point.date,
      entityKind: point.entityKind,
      transition: point.transition,
      visibility: 'visible',
      title: owner ? owner.title : getProfile().displayName,
      summary: record.text,
      href: owner
        ? `${buildProjectUrl(owner.humanReadableSlug, owner.publicId)}#statuses`
        : '/#statuses',
      media: record.media,
      statusKind: record.kind,
      statusOwner: owner ? 'project' : 'profile',
      ...(owner ? { project: await buildPublicEntityReference(owner) } : {}),
    };
  }
  if (point.entityKind === 'event') {
    const event = point.event!;
    const summary = await buildPublicEventSummary(event, viewer);
    return {
      key,
      date: point.date,
      ...(point.period ? { period: point.period } : {}),
      ...(point.precision ? { precision: point.precision } : {}),
      ...(point.periodLabel ? { periodLabel: point.periodLabel } : {}),
      ...(point.ongoing ? { ongoing: true as const } : {}),
      entityKind: point.entityKind,
      transition: point.transition,
      visibility: 'visible',
      title: event.title,
      summary: event.summary,
      href: buildEventUrl(event.humanReadableSlug, event.publicId),
      media: summary.media,
      tags: summary.tags,
      relatedEntities: summary.relatedEntities,
    };
  }
  if (point.entityKind === 'diary-entry') {
    const entry = point.diaryEntry!;
    const [media, content] = await Promise.all([
      buildPublicEntityPreviewMedia(
        'diary-entry',
        entry.diaryUuid,
        'diary-body',
        { type: 'diary-entry', date: entry.date },
        opens,
      ),
      THEI_SERVER.content.findByOwner(
        'diary-entry',
        entry.diaryUuid,
        'diary-body',
      ),
    ]);
    return {
      key,
      date: point.date,
      entityKind: point.entityKind,
      transition: point.transition,
      visibility: 'visible',
      // An entry has no title of its own, and the card knows to print its
      // opening in place of one rather than a heading and a summary.
      title: '',
      summary: diaryContentExcerpt(
        content?.data,
        opens,
        THEI_SERVER.phrase.content_private_section,
      ),
      href: buildDiaryUrl(entry.date),
      ...(media ? { media } : {}),
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
    const summary = await buildPublicProjectSummary(project, viewer.isAdmin);
    return {
      key,
      date: point.date,
      ...(point.period ? { period: point.period } : {}),
      ...(point.precision ? { precision: point.precision } : {}),
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
  const section = point.section!;
  const [media, projectReference] = await Promise.all([
    buildPublicSectionCardMedia(project, section, opens),
    buildPublicEntityReference(project),
  ]);
  return {
    key,
    date: point.date,
    ...(point.period ? { period: point.period } : {}),
    ...(point.precision ? { precision: point.precision } : {}),
    ...(point.periodLabel ? { periodLabel: point.periodLabel } : {}),
    ...(point.ongoing ? { ongoing: true as const } : {}),
    entityKind: point.entityKind,
    transition: point.transition,
    visibility: 'visible',
    title: section.title,
    summary: section.summary,
    href: buildProjectSectionUrl(
      project.humanReadableSlug,
      project.publicId,
      section.humanReadableSlug,
      section.publicId,
    ),
    media,
    project: projectReference,
  };
}

function secretPointUuid(point: RawPoint): string {
  if (point.entityKind === 'event') return point.event!.eventUuid;
  if (point.entityKind === 'diary-entry') return point.diaryEntry!.diaryUuid;
  if (point.entityKind === 'page') return point.page!.pageUuid;
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
    if (match && isLifeDay(match[1]!)) return match[1]!;
  } catch {}
  throw createError({ statusCode: 400, statusText: 'Invalid cursor' });
}

export { buildLifeUrl };

/**
 * One year of the timeline as per-day counts, for the activity grid.
 *
 * Counts are of timeline points, the same things the feed shows, so a day with
 * two events and a section that ended counts three. What the visitor may not see
 * is counted as `secret` — the feed already admits that something happened on
 * that day without saying what.
 */
export async function getLifeActivity(
  options: LifeQuery & { year?: number },
): Promise<LifeActivityResponse> {
  const index = buildLifeIndex(options.scope, options.filter, options.now);
  const years = [
    ...new Set(
      [...index.dates, ...index.startedOn.keys()].map((date) =>
        Number(date.slice(0, 4)),
      ),
    ),
  ].sort((a, b) => b - a);
  const requested = options.year;
  // Without a year asked for, the grid opens on the year being lived. Only a
  // year with nothing in it falls back to the latest one.
  const current = Number(
    lifeArrivalCutoff(options.now ?? Date.now()).slice(0, 4),
  );
  const year =
    requested && years.includes(requested)
      ? requested
      : (requested ??
        (years.includes(current) ? current : (years[0] ?? current)));

  const days: LifeActivityResponse['days'] = {};
  let max = 0;
  const prefix = `${year}-`;
  const entityPoints: LifeActivityEntityPoint[] = [];
  // A folded card counts on the day its period began as well as on the day
  // it ended: both are days something happened.
  const dates = new Set([
    ...index.pointsByDate.keys(),
    ...index.startedOn.keys(),
  ]);
  for (const date of dates) {
    if (!date.startsWith(prefix)) continue;
    const counts: Partial<Record<LifeActivityKind, number>> = {};
    for (const point of lifeDayPoints(index, date)) {
      const visible = pointIsVisible(point, options.viewer);
      const kind: LifeActivityKind = visible ? point.entityKind : 'secret';
      counts[kind] = (counts[kind] ?? 0) + 1;
      if ((LIFE_ACTIVITY_TOTAL_KINDS as readonly string[]).includes(kind))
        entityPoints.push({
          entityKind: point.entityKind,
          entityUuid: secretPointUuid(point),
          visible,
        });
    }
    days[date] = counts;
    max = Math.max(max, lifeActivityDayTotal(counts));
  }

  return {
    year,
    years,
    days,
    max,
    totals: countLifeActivityEntities(entityPoints),
  };
}

/** One day, hydrated, for the panel under the activity grid. */
export async function getLifeDay(
  date: string,
  options: LifeQuery,
): Promise<LifeDay> {
  const index = buildLifeIndex(options.scope, options.filter, options.now);
  return hydrateLifeDay(
    index,
    date,
    options.viewer,
    lifeDayPoints(index, date),
  );
}

/** What happened on a day: its own cards, then the folded ones that began on it. */
function lifeDayPoints(index: LifeIndex, date: string): RawPoint[] {
  return [
    ...(index.pointsByDate.get(date) ?? []),
    ...(index.startedOn.get(date) ?? []),
  ];
}
