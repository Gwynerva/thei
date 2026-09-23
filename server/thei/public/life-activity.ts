import {
  LIFE_ACTIVITY_TOTAL_KINDS,
  type LifeActivityTotalKind,
  type LifeEntityKind,
} from '#layers/thei/shared/life';

/**
 * The arithmetic behind the activity block's year summary, kept apart from
 * the database so it can be read — and tested — on its own.
 */

export type LifeActivityEntityPoint = {
  entityKind: LifeEntityKind;
  /** The entity the point belongs to, not the point itself. */
  entityUuid: string;
  visible: boolean;
};

/**
 * Distinct entities per kind. A stage that started and ended within the year
 * is two points but one stage; what the visitor may not see is left out, as
 * the grid already reports it only as "something hidden".
 */
export function countLifeActivityEntities(
  points: Iterable<LifeActivityEntityPoint>,
): Partial<Record<LifeActivityTotalKind, number>> {
  const seen = new Map<LifeActivityTotalKind, Set<string>>();
  for (const point of points) {
    if (!point.visible) continue;
    const kind = point.entityKind as LifeActivityTotalKind;
    if (!LIFE_ACTIVITY_TOTAL_KINDS.includes(kind)) continue;
    const set = seen.get(kind) ?? new Set<string>();
    set.add(point.entityUuid);
    seen.set(kind, set);
  }
  return Object.fromEntries(
    [...seen].map(([kind, set]) => [kind, set.size]),
  ) as Partial<Record<LifeActivityTotalKind, number>>;
}
