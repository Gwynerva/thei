import type { PublicProjectReference, PublicTagSummary } from './api/public';
import type { DateRange } from './date-range';
import type { MediaDescriptor } from './media';

export type LifeEntityKind =
  'event' | 'project' | 'page' | 'project-stage' | 'project-section';
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
  relatedProjects?: PublicProjectReference[];
};

export type SecretLifePoint = LifePointBase & {
  visibility: 'secret';
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
