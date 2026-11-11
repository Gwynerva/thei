import { inArray } from 'drizzle-orm';
import {
  ProjectEventAccessLevel,
  strictestAccess,
} from '#layers/thei/shared/access-level';
import type { ContentEntityParent } from '#layers/thei/shared/content-link';
import { coverDatedPeriods } from '#layers/thei/shared/date-precision';
import { utcDayOf } from '#layers/thei/shared/date-range';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import {
  excerptSubjectLimit,
  type ExcerptParentType,
} from '#layers/thei/shared/excerpt';
import type { ExcerptParentAddress } from '#layers/thei/shared/excerpt-url';
import {
  dayArrives,
  lastArrivedDay,
  lifeArrivalCutoff,
} from '#layers/thei/shared/life';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { opensPrivate, type PublicViewer } from '../access-links/viewer';
import { getEventPeriods } from '../events/periods';
import { inChunks } from '../db/in-chunks';
import type { ExcerptSubject } from './subjects';

/**
 * An excerpt's parent, as everything public about the excerpt is built from
 * it: its address, its access, the day it stands on, and the row itself.
 *
 * An excerpt has no access of its own. It is as open as the stricter of its
 * parent and what it is about — its subject — unless it is marked private,
 * and it is seen only by whoever may open both: its own private side, the
 * one a share link on the parent opens, is the parent's, and a private
 * subject's is the subject's. Nothing of it is stored: a subject made public
 * opens its excerpts again, all but those marked private by hand. An excerpt
 * about nothing — its subject deleted — is judged by its parent alone. The
 * predicates below are the one place that says so, for the page, the block
 * on a subject, the Markdown copy, the card, a link to it, its files, the
 * sitemap and the search alike.
 */

type ProjectRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.projects.findByUuid>>
>;
type EventRow = NonNullable<
  Awaited<ReturnType<typeof THEI_SERVER.events.findByUuid>>
>;
/** What a diary entry's excerpts are built from: the page builder's own row suffices. */
type DiaryRow = {
  diaryUuid: string;
  date: string;
  access: ProjectEventAccessLevel;
  createdAt: number;
};

export type ExcerptParentInfo = {
  type: ExcerptParentType;
  id: string;
  address: ExcerptParentAddress;
  access: ProjectEventAccessLevel;
  /** Empty for a diary entry, which is called by its `date`. */
  title: string;
  href: string;
  /**
   * The day the parent's excerpts are dated by: a diary entry's day, the
   * last day of an event that has come. A project has no day of its own:
   * its excerpts stand on the day each was written (`excerptDay`).
   */
  date?: string;
  /** When a stranger first sees the parent's excerpts: a day still to come waits. */
  arrives: number;
  createdAt: number;
} & (
  | { type: 'project'; row: ProjectRow }
  | { type: 'event'; row: EventRow }
  | { type: 'diary-entry'; row: DiaryRow }
);

export function projectExcerptParent(project: ProjectRow): ExcerptParentInfo {
  const address = {
    type: 'project',
    humanReadableSlug: project.humanReadableSlug,
    publicId: project.publicId,
  } as const;
  return {
    type: 'project',
    id: project.projectUuid,
    address,
    access: project.access,
    title: project.title,
    href: buildProjectUrl(project.humanReadableSlug, project.publicId),
    arrives: 0,
    createdAt: project.createdAt,
    row: project,
  };
}

/**
 * An event's excerpts are dated by the last day of it that has come, as its
 * own points stand on a chronology: a period still running by its start.
 * Before any has come they wait, dated by the first day that will.
 */
export function eventExcerptParent(
  event: EventRow,
  now: number = Date.now(),
): ExcerptParentInfo {
  const periods = getEventPeriods(event.eventUuid);
  const cover = periods.length ? coverDatedPeriods(periods) : undefined;
  return {
    type: 'event',
    id: event.eventUuid,
    address: {
      type: 'event',
      humanReadableSlug: event.humanReadableSlug,
      publicId: event.publicId,
    },
    access: event.access,
    title: event.title,
    href: buildEventUrl(event.humanReadableSlug, event.publicId),
    date:
      lastArrivedDay(periods, lifeArrivalCutoff(now)) ??
      cover?.startDate ??
      utcDayOf(event.createdAt),
    arrives: cover ? dayArrives(cover.startDate) : 0,
    createdAt: event.createdAt,
    row: event,
  };
}

export function diaryExcerptParent(entry: DiaryRow): ExcerptParentInfo {
  return {
    type: 'diary-entry',
    id: entry.diaryUuid,
    address: { type: 'diary-entry', date: entry.date },
    access: entry.access,
    title: '',
    href: buildDiaryUrl(entry.date),
    date: entry.date,
    arrives: dayArrives(entry.date),
    createdAt: entry.createdAt,
    row: entry,
  };
}

/**
 * The day an excerpt of a project stands on, on a chronology and wherever
 * excerpts are put in time order: the day it was written, since a project
 * has no day of its own.
 */
export function projectExcerptDay(excerpt: { createdAt: number }): string {
  return utcDayOf(excerpt.createdAt);
}

/** The day an excerpt stands on: its parent's, or else its own (`projectExcerptDay`). */
export function excerptDay(
  excerpt: { createdAt: number },
  parent: Pick<ExcerptParentInfo, 'date'>,
): string {
  return parent.date ?? projectExcerptDay(excerpt);
}

/**
 * A parent as what names its excerpt carries it. A diary entry is named by
 * its day, so only it comes with a `date`: an event's is the day its
 * excerpts are dated by, not its name.
 */
export function excerptParentRef(
  parent: ExcerptParentInfo,
): ContentEntityParent {
  return {
    type: parent.type,
    title: parent.title,
    ...(parent.type === 'diary-entry' ? { date: parent.row.date } : {}),
    href: parent.href,
  };
}

/** A parent by its kind and uuid, or nothing when it is gone. */
export async function loadExcerptParent(
  type: ExcerptParentType,
  id: string,
): Promise<ExcerptParentInfo | undefined> {
  switch (type) {
    case 'project': {
      const project = await THEI_SERVER.projects.findByUuid(id);
      return project && projectExcerptParent(project);
    }
    case 'event': {
      const event = await THEI_SERVER.events.findByUuid(id);
      return event && eventExcerptParent(event);
    }
    case 'diary-entry': {
      const entry = await THEI_SERVER.diary.findByUuid(id);
      return entry && diaryExcerptParent(entry);
    }
  }
}

/**
 * Some parents by their kind and uuid, by `type:id`, read a kind at a time:
 * what the excerpts about one entity need, gathered from many parents. One
 * gone is absent.
 */
export function loadExcerptParents(
  keys: readonly { type: ExcerptParentType; id: string }[],
  now: number = Date.now(),
): Map<string, ExcerptParentInfo> {
  const { db, schema } = THEI_SERVER.useDb();
  const idsOf = (type: ExcerptParentType) => [
    ...new Set(keys.filter((key) => key.type === type).map((key) => key.id)),
  ];
  const parents = new Map<string, ExcerptParentInfo>();
  const put = (parent: ExcerptParentInfo) =>
    parents.set(`${parent.type}:${parent.id}`, parent);
  const read = (table: any, column: any, ids: string[]): any[] =>
    inChunks(ids).flatMap((chunk) =>
      db.select().from(table).where(inArray(column, chunk)).all(),
    );
  for (const row of read(
    schema.projects,
    schema.projects.projectUuid,
    idsOf('project'),
  ))
    put(projectExcerptParent(row));
  for (const row of read(
    schema.events,
    schema.events.eventUuid,
    idsOf('event'),
  ))
    put(eventExcerptParent(row, now));
  for (const row of read(
    schema.diaryEntries,
    schema.diaryEntries.diaryUuid,
    idsOf('diary-entry'),
  ))
    put(diaryExcerptParent(row));
  return parents;
}

/**
 * A parent by the public parts of an address: a project or an event by its
 * public id, a diary entry by its day.
 */
export async function findExcerptParentByAddress(
  address:
    | { type: 'project' | 'event'; publicId: string }
    | { type: 'diary-entry'; date: string },
): Promise<ExcerptParentInfo | undefined> {
  switch (address.type) {
    case 'project': {
      const project = await THEI_SERVER.projects.findByPublicId(
        address.publicId,
      );
      return project && projectExcerptParent(project);
    }
    case 'event': {
      const event = await THEI_SERVER.events.findByPublicId(address.publicId);
      return event && eventExcerptParent(event);
    }
    case 'diary-entry': {
      const entry = await THEI_SERVER.diary.findByDate(address.date);
      return entry && diaryExcerptParent(entry);
    }
  }
}

/** The private side of an excerpt's own: its parent's — the owner's, or a share link's. */
export function excerptIsOwn(
  viewer: PublicViewer,
  parent: Pick<ExcerptParentInfo, 'type' | 'id'>,
): boolean {
  return opensPrivate(viewer, parent.type, parent.id);
}

/** What an excerpt is judged by: its own flag and what it is about. */
type JudgedExcerpt = {
  isPrivate: boolean;
  subject: ExcerptSubject | null;
};

/**
 * Whether what an excerpt is about lets a viewer see it. A public subject,
 * or none, lets anyone; a private one only its private side; one open by
 * its link only lets a viewer who has its address (`listed` false: the
 * excerpt's own page, the subject's page) or its share link.
 */
export function excerptSubjectOpens(
  viewer: PublicViewer,
  subject: ExcerptSubject | null,
  listed: boolean,
): boolean {
  const limit = excerptSubjectLimit(subject?.access);
  if (!subject || !limit) return true;
  if (opensPrivate(viewer, subject.type, subject.id)) return true;
  return limit === ProjectEventAccessLevel.LinkOnly && !listed;
}

/** The access an excerpt is judged by where one value is asked for: the strictest of the three. */
export function excerptAccess(
  excerpt: JudgedExcerpt,
  parent: Pick<ExcerptParentInfo, 'access'>,
): ProjectEventAccessLevel {
  return strictestAccess(
    excerpt.isPrivate ? ProjectEventAccessLevel.Private : undefined,
    parent.access,
    excerpt.subject?.access,
  );
}

/**
 * Whether an excerpt shows on its parent's page for a viewer — whoever asks
 * has the parent's page open already: not private, or on the parent's
 * private side, and about something the viewer may see listed. On the
 * excerpt's own page its address is in hand, and a subject open by its link
 * opens by it (`byAddress`).
 */
export function excerptShownWithParent(
  viewer: PublicViewer,
  excerpt: JudgedExcerpt,
  parent: Pick<ExcerptParentInfo, 'type' | 'id'>,
  options: { byAddress?: boolean } = {},
): boolean {
  return (
    (!excerpt.isPrivate || excerptIsOwn(viewer, parent)) &&
    excerptSubjectOpens(viewer, excerpt.subject, !options.byAddress)
  );
}

/**
 * Whether an excerpt's page opens for a viewer: where its parent's page
 * opens, the excerpt is not private or the parent's private side is the
 * viewer's, and its subject opens by its address.
 */
export function excerptOpens(
  viewer: PublicViewer,
  excerpt: JudgedExcerpt,
  parent: Pick<ExcerptParentInfo, 'type' | 'id' | 'access'>,
): boolean {
  const own = excerptIsOwn(viewer, parent);
  return (
    (own || parent.access !== ProjectEventAccessLevel.Private) &&
    excerptShownWithParent(viewer, excerpt, parent, { byAddress: true })
  );
}

/**
 * Whether an excerpt is listed to a viewer — on the page of what it is
 * about, in the sitemap, in the search: where the parent may be listed or
 * its private side is the viewer's, the excerpt is not private, and its
 * subject may be listed too. An excerpt of a parent open only by its link
 * is for those given the link. On its subject's own page the subject is the
 * one the viewer opened (`onSubjectPage`).
 */
export function excerptListed(
  viewer: PublicViewer,
  excerpt: JudgedExcerpt,
  parent: Pick<ExcerptParentInfo, 'type' | 'id' | 'access'>,
  options: { onSubjectPage?: boolean } = {},
): boolean {
  const own = excerptIsOwn(viewer, parent);
  return (
    (own ||
      (!excerpt.isPrivate &&
        parent.access === ProjectEventAccessLevel.Public)) &&
    (options.onSubjectPage ||
      excerptSubjectOpens(viewer, excerpt.subject, true))
  );
}
