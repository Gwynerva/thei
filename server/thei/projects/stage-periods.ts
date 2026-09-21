import { and, eq, inArray } from 'drizzle-orm';
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
