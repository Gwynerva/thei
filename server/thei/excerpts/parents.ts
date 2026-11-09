import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { coverDatedPeriods } from '#layers/thei/shared/date-precision';
import { utcDayOf } from '#layers/thei/shared/date-range';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import type { ExcerptParentType } from '#layers/thei/shared/excerpt';
import {
  buildExcerptParentUrl,
  type ExcerptParentAddress,
} from '#layers/thei/shared/excerpt-url';
import { dayArrives } from '#layers/thei/shared/life';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { opensPrivate, type PublicViewer } from '../access-links/viewer';
import { getEventPeriods } from '../events/periods';

/**
 * An excerpt's parent, as everything public about the excerpt is built from
 * it: its address, its access, the day it stands on, and the row itself.
 *
 * An excerpt has no access of its own. It is as open as its parent, unless
 * it is marked private, and its private side — the one a share link on the
 * parent opens — is the parent's. The predicates below are the one place
 * that says so, for the page, the block on a target, the Markdown copy, the
 * card, the sitemap and the search alike.
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
   * The day the parent's excerpts are dated by: a diary entry's day, an
   * event's last day. A project has no day of its own.
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

export function eventExcerptParent(event: EventRow): ExcerptParentInfo {
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
    date: cover?.endDate ?? utcDayOf(event.createdAt),
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

/** The parent's address alone, for a URL. */
export function excerptParentAddress(
  parent: ExcerptParentInfo,
): ExcerptParentAddress {
  return parent.address;
}

/** Where the parent's page is. */
export function excerptParentHref(parent: ExcerptParentInfo) {
  return buildExcerptParentUrl(parent.address);
}

/** The private side of an excerpt is its parent's: the owner's, or a share link's. */
export function excerptIsOwn(
  viewer: PublicViewer,
  parent: Pick<ExcerptParentInfo, 'type' | 'id'>,
): boolean {
  return opensPrivate(viewer, parent.type, parent.id);
}

/** The access an excerpt is judged by where one value is asked for. */
export function excerptAccess(
  excerpt: { isPrivate: boolean },
  parent: Pick<ExcerptParentInfo, 'access'>,
): ProjectEventAccessLevel {
  return excerpt.isPrivate ? ProjectEventAccessLevel.Private : parent.access;
}

/**
 * Whether an excerpt's page opens for a viewer: on the private side, or
 * where the parent's page opens and the excerpt is not private.
 */
export function excerptOpens(
  excerpt: { isPrivate: boolean },
  parent: Pick<ExcerptParentInfo, 'access'>,
  own: boolean,
): boolean {
  return (
    own ||
    (!excerpt.isPrivate && parent.access !== ProjectEventAccessLevel.Private)
  );
}

/**
 * Whether an excerpt is listed to a viewer — on the page of what it is
 * about, in the sitemap, in the search: on the private side, or where the
 * parent may be listed and the excerpt is not private. An excerpt of a
 * parent open only by its link is for those given the link.
 */
export function excerptListed(
  excerpt: { isPrivate: boolean },
  parent: Pick<ExcerptParentInfo, 'access'>,
  own: boolean,
): boolean {
  return (
    own ||
    (!excerpt.isPrivate && parent.access === ProjectEventAccessLevel.Public)
  );
}
