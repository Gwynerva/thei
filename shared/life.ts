import type {
  PublicEntityLink,
  PublicEntityReference,
  PublicTagSummary,
} from './api/public';
import type { DateRange } from './date-range';
import type { DatePrecisionInfo } from './date-precision';
import type { MediaDescriptor } from './media';
import type { StatusKind } from './status';

export const LIFE_ENTITY_KINDS = [
  'event',
  'project',
  'page',
  'project-stage',
  'project-section',
  'profile-avatar',
  'profile-status',
  'diary-entry',
] as const;
export type LifeEntityKind = (typeof LIFE_ENTITY_KINDS)[number];
export type LifeTransition = 'started' | 'ended' | 'occurred' | 'created';
export type LifeRailTone = 'accent' | 'warning' | 'warning-to-accent';

type LifePointBase = {
  date: string;
  period?: DateRange;
  /**
   * How sure the owner is of the date, present only when they doubt it. A
   * card that would otherwise leave its date to the rail still prints it then,
   * so the reader knows not to take the day at its word.
   */
  precision?: DatePrecisionInfo;
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
  project?: PublicEntityReference;
  relatedEntities?: PublicEntityLink[];
  statusKind?: StatusKind;
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

/**
 * Which chronology is being read.
 *
 * The life of the person and the life of one project are the same feed with a
 * different reach, so the scope travels with every request rather than each
 * getting its own endpoint.
 */
export type LifeScope =
  { kind: 'life' } | { kind: 'project'; projectUuid: string };

export const LIFE_SCOPE_LIFE = { kind: 'life' } as const satisfies LifeScope;

/**
 * A scope as a page names it.
 *
 * The server narrows by the project's storage id; a page only knows the
 * public id its own address carries, and `/api/life?project=` accepts that.
 * Keeping the two apart means no page has to be handed an internal id just to
 * ask for a feed.
 */
export type LifeScopeRef =
  { kind: 'life' } | { kind: 'project'; publicId: string };

/**
 * The kinds a project's chronology can hold.
 *
 * Avatars and other projects belong to the person, not to a project, so they
 * are not offered as filters there.
 */
export const PROJECT_LIFE_ENTITY_KINDS = [
  'event',
  'project-stage',
  'project-section',
  'profile-status',
  'diary-entry',
] as const satisfies readonly LifeEntityKind[];

export function lifeFilterKinds(
  scope: Pick<LifeScope, 'kind'>,
): readonly LifeEntityKind[] {
  return scope.kind === 'project'
    ? PROJECT_LIFE_ENTITY_KINDS
    : LIFE_ENTITY_KINDS;
}

/**
 * A chosen subset of kinds, or `undefined` for "show everything".
 *
 * "Everything" is deliberately not the full set spelled out: the set grows
 * with the engine, and a link shared today should keep meaning "everything"
 * after a new kind appears.
 */
export type LifeFilter = readonly LifeEntityKind[] | undefined;

export function parseLifeFilter(
  value: unknown,
  scope: Pick<LifeScope, 'kind'> = LIFE_SCOPE_LIFE,
): LifeFilter {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const allowed = lifeFilterKinds(scope);
  const chosen = value
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is LifeEntityKind =>
      (allowed as readonly string[]).includes(part),
    );
  const unique = [...new Set(chosen)];
  // Nothing recognised, or everything selected, both mean "no filter".
  if (!unique.length || unique.length === allowed.length) return undefined;
  return unique;
}

export function serializeLifeFilter(filter: LifeFilter): string | undefined {
  return filter?.length ? [...filter].join(',') : undefined;
}

export function lifeFilterIncludes(
  filter: LifeFilter,
  kind: LifeEntityKind,
): boolean {
  return !filter || filter.includes(kind);
}

export type LifeUrlOptions = {
  /** The day the reader is looking at, as `YYYY-MM-DD`. */
  date?: string;
  filter?: LifeFilter;
};

/**
 * Builds a chronology address.
 *
 * The day is a query parameter rather than a path so that a filter can travel
 * in the same address: a shared link carries both what is being read and how
 * it is narrowed.
 */
export function buildLifeUrl(
  options: LifeUrlOptions = {},
  base = '/life/',
): string {
  const query = new URLSearchParams();
  if (options.date) query.set('d', options.date);
  const filter = serializeLifeFilter(options.filter);
  if (filter) query.set('f', filter);
  const search = query.toString();
  return search ? `${base}?${search}` : base;
}

export function isLifeDay(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return false;
  // Rejects the days a month does not have, such as 2026-02-30.
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
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

/** The kinds a year is summed up by, in the order the summary lists them. */
export const LIFE_ACTIVITY_TOTAL_KINDS = [
  'project',
  'event',
  'diary-entry',
  'project-stage',
  'project-section',
] as const satisfies readonly LifeEntityKind[];
export type LifeActivityTotalKind = (typeof LIFE_ACTIVITY_TOTAL_KINDS)[number];

export type LifeActivityResponse = {
  year: number;
  /** Every year that holds something, newest first. */
  years: number[];
  /** `YYYY-MM-DD` → how many points of each kind happened that day. */
  days: Record<string, Partial<Record<LifeActivityKind, number>>>;
  /**
   * How many distinct entities of each kind appeared on the timeline during
   * the year — a stage that both started and ended in it counts once. Only
   * what the visitor may see is counted by kind.
   */
  totals: Partial<Record<LifeActivityTotalKind, number>>;
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
