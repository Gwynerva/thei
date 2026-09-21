import type {
  PublicProjectLink,
  PublicProjectReference,
  PublicTagSummary,
} from './api/public';
import type { DateRange } from './date-range';
import type { MediaDescriptor } from './media';
import type { ProfileStatusKind } from './profile';

export type LifeEntityKind =
  | 'event'
  | 'project'
  | 'page'
  | 'project-stage'
  | 'project-section'
  | 'profile-avatar'
  | 'profile-status';
export type LifeTransition = 'started' | 'ended' | 'occurred' | 'created';
export type LifeRailTone = 'accent' | 'warning' | 'warning-to-accent';

type LifePointBase = {
  date: string;
  period?: DateRange;
  entityKind: LifeEntityKind;
  transition: LifeTransition;
};

export type VisibleLifePoint = LifePointBase & {
  key: string;
  visibility: 'visible';
  title: string;
  summary: string;
  href: string;
  media?: MediaDescriptor;
  tags?: PublicTagSummary[];
  project?: PublicProjectReference;
  relatedProjects?: PublicProjectLink[];
  profileStatusKind?: ProfileStatusKind;
};

/** A point a visitor may not see, presented under a codename. */
export type SecretLifePoint = LifePointBase & {
  key: string;
  visibility: 'secret';
  title: string;
  summary: string;
  media: MediaDescriptor;
};

export type LifePoint = VisibleLifePoint | SecretLifePoint;

export type LifeDay = {
  date: string;
  points: LifePoint[];
};

export type LifeWindowResponse = {
  days: LifeDay[];
  anchorDate: string;
  newestDate: string;
  newerCursor?: string;
  olderCursor?: string;
};

export type LifeLatestResponse = {
  points: LifePoint[];
};

export function buildLifeUrl(period?: string): string {
  return period ? `/life/${period.replaceAll('-', '/')}/` : '/life/';
}

export function lifePeriodFromParts(parts: string[]): string | undefined {
  if (!parts.length) return undefined;
  return parts.join('-');
}

export function isLifePeriod(value: string): boolean {
  if (/^\d{4}$/.test(value)) return true;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return true;
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function isLifeDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isLifePeriod(value);
}

export function normalizeLifeLastViewedDate(
  value: string | null | undefined,
  newestDate: string,
): string | undefined {
  if (!value || !isLifeDay(value)) return undefined;
  if (isLifeDay(newestDate) && value > newestDate) return newestDate;
  return value;
}

export function isLifeDayNew(
  date: string,
  sessionCutoff: string | undefined,
): boolean {
  return Boolean(sessionCutoff && isLifeDay(date) && date > sessionCutoff);
}

export function laterLifeDate(left: string | undefined, right: string): string {
  return left && left > right ? left : right;
}

/**
 * A year of the timeline, counted per day.
 *
 * The grid needs nothing but counts, so the whole year travels as a few
 * hundred small numbers instead of hydrated points; a day's contents are
 * fetched only when someone picks that day.
 */
export type LifeActivityKind = LifeEntityKind | 'secret';

export type LifeActivityResponse = {
  year: number;
  /** Every year that holds something, newest first. */
  years: number[];
  /** `YYYY-MM-DD` → how many points of each kind happened that day. */
  days: Record<string, Partial<Record<LifeActivityKind, number>>>;
  /** Projects whose stages ran during the year, newest first. */
  projects: PublicProjectLink[];
  /** The busiest day of the year, so shades can be scaled against it. */
  max: number;
};

export function lifeActivityDayTotal(
  counts: Partial<Record<LifeActivityKind, number>> | undefined,
): number {
  if (!counts) return 0;
  return Object.values(counts).reduce(
    (total, value) => total + (value ?? 0),
    0,
  );
}

/** Four shades plus "nothing", as a share of the busiest day of the year. */
export function lifeActivityLevel(
  total: number,
  max: number,
): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0) return 0;
  if (max <= 1) return 4;
  const share = total / max;
  if (share <= 0.25) return 1;
  if (share <= 0.5) return 2;
  if (share <= 0.75) return 3;
  return 4;
}
