import { and, asc, eq } from 'drizzle-orm';
import type { DateRange } from '#layers/thei/shared/date-range';
import { replaceStagePeriods } from '../projects/stage-periods';

export function applyEventPeriods(
  tx: any,
  schema: any,
  eventUuid: string,
  periods: DateRange[],
) {
  replaceStagePeriods(tx, schema, 'event-stage', eventUuid, periods);
}

export function getEventPeriods(eventUuid: string): DateRange[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({
      startDate: schema.stagePeriods.startDate,
      endDate: schema.stagePeriods.endDate,
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
