import { isLifeDay, type LifePoint } from './life';
import { sortLifePoints, type LifeBoundaryLike } from './life-timeline';
import type { PaginatedResponse } from './pagination';

export type LifeRewindMatch = 'exact' | 'ongoing';
export type LifeRewindItem = { point: LifePoint; match: LifeRewindMatch };
export type LifeRewindResponse = PaginatedResponse<LifeRewindItem> & {
  referenceDate: string;
};

/** Select from original boundaries: timeline merging deliberately loses some dates. */
export function selectLifeRewindPoints<T extends LifeBoundaryLike>(
  points: readonly T[],
  referenceDate: string,
): Array<{ point: T; match: LifeRewindMatch }> {
  if (!isLifeDay(referenceDate)) return [];
  const currentYear = Number(referenceDate.slice(0, 4));
  const monthDay = referenceDate.slice(4);
  const candidates: Array<T & { rewindMatch: LifeRewindMatch }> = [];
  const periods = new Map<string, { started?: T; ended?: T }>();
  for (const point of points) {
    if (point.transition === 'started' || point.transition === 'ended') {
      const pair = periods.get(point.identity) ?? {};
      pair[point.transition] = point;
      periods.set(point.identity, pair);
    } else if (
      point.date.slice(4) === monthDay &&
      Number(point.date.slice(0, 4)) < currentYear
    ) {
      candidates.push({ ...point, rewindMatch: 'exact' });
    }
  }
  for (const { started, ended } of periods.values()) {
    if (!started || !ended) continue;
    const startDate = started.date;
    const endDate = ended.date;
    const lastYear = Math.min(currentYear - 1, Number(endDate.slice(0, 4)));
    for (let year = Number(startDate.slice(0, 4)); year <= lastYear; year++) {
      const date = `${String(year).padStart(4, '0')}${monthDay}`;
      if (!isLifeDay(date) || date < startDate || date > endDate) continue;
      const exact = date === startDate || date === endDate;
      candidates.push({
        ...(date === endDate ? ended : started),
        date,
        transition:
          startDate === endDate
            ? 'occurred'
            : date === startDate
              ? 'started'
              : date === endDate
                ? 'ended'
                : 'occurred',
        period: startDate === endDate ? undefined : { startDate, endDate },
        rewindMatch: exact ? 'exact' : 'ongoing',
      });
    }
  }
  const selected = new Map<string, T & { rewindMatch: LifeRewindMatch }>();
  for (const point of sortLifePoints(candidates)) {
    const entityIdentity = point.identity.split(':period:')[0];
    const key = `${entityIdentity}:${point.date}`;
    const previous = selected.get(key);
    if (
      !previous ||
      (previous.rewindMatch === 'ongoing' && point.rewindMatch === 'exact')
    ) {
      selected.set(key, point);
    }
  }
  return sortLifePoints([...selected.values()]).map(
    ({ rewindMatch, ...point }) => ({
      point: point as unknown as T,
      match: rewindMatch,
    }),
  );
}
