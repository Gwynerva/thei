import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DatedPeriod } from '#layers/thei/shared/date-precision';
import type { StageType } from '#layers/thei/shared/stage-period';

export function replaceStagePeriods(
  tx: any,
  schema: any,
  stageType: StageType,
  stageUuid: string,
  periods: DatedPeriod[],
) {
  deleteStagePeriods(tx, schema, stageType, [stageUuid]);
  if (!periods.length) return;
  tx.insert(schema.stagePeriods)
    .values(
      periods.map((period, sortOrder) => ({
        stageType,
        stageUuid,
        sortOrder,
        startDate: period.startDate,
        endDate: period.endDate,
        precision: period.precision,
        precisionNote: period.precisionNote,
      })),
    )
    .run();
}

export function readStagePeriods(
  tx: any,
  schema: any,
  stageType: StageType,
  stageUuid: string,
): DatedPeriod[] {
  return tx
    .select({
      startDate: schema.stagePeriods.startDate,
      endDate: schema.stagePeriods.endDate,
      precision: schema.stagePeriods.precision,
      precisionNote: schema.stagePeriods.precisionNote,
    })
    .from(schema.stagePeriods)
    .where(
      and(
        eq(schema.stagePeriods.stageType, stageType),
        eq(schema.stagePeriods.stageUuid, stageUuid),
      ),
    )
    .orderBy(asc(schema.stagePeriods.sortOrder))
    .all();
}

export function stagePeriodsEqual(left: DatedPeriod[], right: DatedPeriod[]) {
  return (
    left.length === right.length &&
    left.every((period, index) => {
      const other = right[index]!;
      return (
        period.startDate === other.startDate &&
        period.endDate === other.endDate &&
        (period.precision ?? 'exact') === (other.precision ?? 'exact') &&
        (period.precisionNote ?? '') === (other.precisionNote ?? '')
      );
    })
  );
}

export function deleteStagePeriods(
  tx: any,
  schema: any,
  stageType: StageType,
  stageUuids: string[],
) {
  if (!stageUuids.length) return;
  tx.delete(schema.stagePeriods)
    .where(
      and(
        eq(schema.stagePeriods.stageType, stageType),
        inArray(schema.stagePeriods.stageUuid, stageUuids),
      ),
    )
    .run();
}
