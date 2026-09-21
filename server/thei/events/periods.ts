import { and, asc, eq } from 'drizzle-orm';
import type { DatedPeriod } from '#layers/thei/shared/date-precision';
import { replaceStagePeriods } from '../projects/stage-periods';

export function applyEventPeriods(
  tx: any,
  schema: any,
  eventUuid: string,
  periods: DatedPeriod[],
) {
  replaceStagePeriods(tx, schema, 'event-stage', eventUuid, periods);
}

export function getEventPeriods(eventUuid: string): DatedPeriod[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({
      startDate: schema.stagePeriods.startDate,
      endDate: schema.stagePeriods.endDate,
      precision: schema.stagePeriods.precision,
      precisionNote: schema.stagePeriods.precisionNote,
    })
    .from(schema.stagePeriods)
    .where(
      and(
        eq(schema.stagePeriods.stageType, 'event-stage'),
        eq(schema.stagePeriods.stageUuid, eventUuid),
      ),
    )
    .orderBy(asc(schema.stagePeriods.sortOrder))
    .all();
}
