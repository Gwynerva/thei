import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Period, PeriodOwnerType } from '#layers/thei/shared/period';

export function replacePeriods(
  tx: any,
  schema: any,
  ownerType: PeriodOwnerType,
  ownerId: string,
  periods: Period[],
) {
  deletePeriods(tx, schema, ownerType, [ownerId]);
  if (!periods.length) return;
  tx.insert(schema.periods)
    .values(
      periods.map((period, sortOrder) => ({
        ownerType,
        ownerId,
        sortOrder,
        startDate: period.startDate,
        endDate: period.endDate,
        precision: period.precision,
        precisionNote: period.precisionNote,
        label: period.label,
      })),
    )
    .run();
}

export function readPeriods(
  tx: any,
  schema: any,
  ownerType: PeriodOwnerType,
  ownerId: string,
): Period[] {
  return tx
    .select({
      startDate: schema.periods.startDate,
      endDate: schema.periods.endDate,
      precision: schema.periods.precision,
      precisionNote: schema.periods.precisionNote,
      label: schema.periods.label,
    })
    .from(schema.periods)
    .where(
      and(
        eq(schema.periods.ownerType, ownerType),
        eq(schema.periods.ownerId, ownerId),
      ),
    )
    .orderBy(asc(schema.periods.sortOrder))
    .all();
}

export function periodsEqual(left: Period[], right: Period[]) {
  return (
    left.length === right.length &&
    left.every((period, index) => {
      const other = right[index]!;
      return (
        period.startDate === other.startDate &&
        period.endDate === other.endDate &&
        period.precision === other.precision &&
        period.precisionNote === other.precisionNote &&
        period.label === other.label
      );
    })
  );
}

export function deletePeriods(
  tx: any,
  schema: any,
  ownerType: PeriodOwnerType,
  ownerIds: string[],
) {
  if (!ownerIds.length) return;
  tx.delete(schema.periods)
    .where(
      and(
        eq(schema.periods.ownerType, ownerType),
        inArray(schema.periods.ownerId, ownerIds),
      ),
    )
    .run();
}

/**
 * The periods of several owners at once, by owner, each list in its stored
 * order — the canonical one: two periods may share their dates and differ
 * only in their labels.
 */
export function readPeriodsOf(
  tx: any,
  schema: any,
  ownerType: PeriodOwnerType,
  ownerIds: string[],
): Map<string, Period[]> {
  const byOwner = new Map<string, Period[]>();
  if (!ownerIds.length) return byOwner;
  const rows: (Period & { ownerId: string })[] = tx
    .select({
      ownerId: schema.periods.ownerId,
      startDate: schema.periods.startDate,
      endDate: schema.periods.endDate,
      precision: schema.periods.precision,
      precisionNote: schema.periods.precisionNote,
      label: schema.periods.label,
    })
    .from(schema.periods)
    .where(
      and(
        eq(schema.periods.ownerType, ownerType),
        inArray(schema.periods.ownerId, ownerIds),
      ),
    )
    .orderBy(asc(schema.periods.sortOrder))
    .all();
  for (const { ownerId, ...period } of rows) {
    const list = byOwner.get(ownerId) ?? [];
    list.push(period);
    byOwner.set(ownerId, list);
  }
  return byOwner;
}
