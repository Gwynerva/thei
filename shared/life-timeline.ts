import type { ProjectEventAccessLevel } from './access-level';
import type { DateRange } from './date-range';
import type { LifeTransition } from './life';

export type LifeBoundaryLike = {
  identity: string;
  date: string;
  transition: LifeTransition;
  sortTime: number;
  entityKind: string;
  period?: DateRange;
};

export type LifeDayViewportRect = {
  date: string;
  top: number;
  bottom: number;
};

export function selectActiveLifeDay(
  rects: LifeDayViewportRect[],
  visibleTop: number,
  visibleBottom: number,
  tolerance = 1,
): string | undefined {
  const ordered = rects
    .filter(
      ({ date, top, bottom }) =>
        date &&
        Number.isFinite(top) &&
        Number.isFinite(bottom) &&
        bottom >= top,
    )
    .sort((left, right) => left.top - right.top || left.bottom - right.bottom);

  const fullyVisible = ordered.find(
    ({ top, bottom }) =>
      top >= visibleTop - tolerance && bottom <= visibleBottom + tolerance,
  );
  if (fullyVisible) return fullyVisible.date;

  return ordered.find(
    ({ top, bottom }) =>
      bottom > visibleTop + tolerance && top < visibleBottom - tolerance,
  )?.date;
}

export function mergeLifeBoundaryPoints<T extends LifeBoundaryLike>(
  points: T[],
): T[] {
  const dateIndexes = new Map(
    Array.from(new Set(points.map(({ date }) => date)))
      .sort()
      .reverse()
      .map((date, index) => [date, index]),
  );
  const boundaries = new Map<string, { started?: T; ended?: T }>();
  for (const point of points) {
    if (point.transition !== 'started' && point.transition !== 'ended')
      continue;
    const pair = boundaries.get(point.identity) ?? {};
    pair[point.transition] = point;
    boundaries.set(point.identity, pair);
  }

  const removed = new Set<T>();
  const merged: T[] = [];
  for (const { started, ended } of boundaries.values()) {
    if (!started || !ended) continue;
    const startedIndex = dateIndexes.get(started.date);
    const endedIndex = dateIndexes.get(ended.date);
    if (
      startedIndex === undefined ||
      endedIndex === undefined ||
      (started.date !== ended.date && Math.abs(startedIndex - endedIndex) !== 1)
    ) {
      continue;
    }

    const newer = started.date >= ended.date ? started : ended;
    const startDate = started.date <= ended.date ? started.date : ended.date;
    const endDate = started.date >= ended.date ? started.date : ended.date;
    removed.add(started);
    removed.add(ended);
    merged.push({
      ...newer,
      date: endDate,
      transition: 'occurred',
      sortTime: Date.parse(`${endDate}T12:00:00Z`),
      ...(startDate === endDate
        ? { period: undefined }
        : { period: { startDate, endDate } }),
    });
  }

  return [...points.filter((point) => !removed.has(point)), ...merged];
}

export function lifePointSortRank(point: Pick<LifeBoundaryLike, 'transition'>) {
  if (point.transition === 'ended') return 4;
  if (point.transition === 'created') return 3;
  if (point.transition === 'occurred') return 2;
  return 1;
}

export function sortLifePoints<T extends LifeBoundaryLike>(points: T[]) {
  return [...points].sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      lifePointSortRank(right) - lifePointSortRank(left) ||
      (left.transition === 'created' && right.transition === 'created'
        ? right.sortTime - left.sortTime
        : 0) ||
      left.entityKind.localeCompare(right.entityKind) ||
      left.identity.localeCompare(right.identity),
  );
}

export function lifePointIsVisible(
  access: ProjectEventAccessLevel,
  privatePart: boolean | undefined,
  isAdmin: boolean,
) {
  return isAdmin || (access === 'public' && !privatePart);
}

export function projectCreatedUtcDate(createdAt: number | string | Date) {
  return new Date(createdAt).toISOString().slice(0, 10);
}

export function lifeGapDays(newerDate: string, olderDate: string) {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${newerDate}T00:00:00Z`) -
        Date.parse(`${olderDate}T00:00:00Z`)) /
        86_400_000,
    ),
  );
}

export type LifeGapDuration = {
  years: number;
  months: number;
  days: number;
};

export function lifeGapDuration(
  newerDate: string,
  olderDate: string,
): LifeGapDuration {
  const newer = parseUtcDate(newerDate);
  const older = parseUtcDate(olderDate);
  if (newer.getTime() <= older.getTime())
    return { years: 0, months: 0, days: 0 };

  let cursor = older;
  let years = newer.getUTCFullYear() - cursor.getUTCFullYear();
  let candidate = addUtcYears(cursor, years);
  if (candidate > newer) {
    years--;
    candidate = addUtcYears(cursor, years);
  }
  cursor = candidate;

  let months =
    (newer.getUTCFullYear() - cursor.getUTCFullYear()) * 12 +
    newer.getUTCMonth() -
    cursor.getUTCMonth();
  candidate = addUtcMonths(cursor, months);
  if (candidate > newer) {
    months--;
    candidate = addUtcMonths(cursor, months);
  }
  cursor = candidate;

  return {
    years,
    months,
    days: Math.round((newer.getTime() - cursor.getTime()) / 86_400_000),
  };
}

function parseUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addUtcYears(value: Date, years: number) {
  return createClampedUtcDate(
    value.getUTCFullYear() + years,
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

function addUtcMonths(value: Date, months: number) {
  const absoluteMonth =
    value.getUTCFullYear() * 12 + value.getUTCMonth() + months;
  return createClampedUtcDate(
    Math.floor(absoluteMonth / 12),
    ((absoluteMonth % 12) + 12) % 12,
    value.getUTCDate(),
  );
}

function createClampedUtcDate(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}
