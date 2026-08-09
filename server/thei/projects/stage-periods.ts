import { and, eq, inArray } from 'drizzle-orm';
import type { DateRange } from '#layers/thei/shared/date-range';
import type { StageType } from '#layers/thei/shared/stage-period';

export function replaceStagePeriods(
  tx: any,
  schema: any,
  stageType: StageType,
  stageUuid: string,
  periods: DateRange[],
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
