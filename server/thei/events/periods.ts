import type { StagePeriod } from '#layers/thei/shared/stage-period';
import {
  readStagePeriods,
  replaceStagePeriods,
} from '../projects/stage-periods';

export function applyEventPeriods(
  tx: any,
  schema: any,
  eventUuid: string,
  periods: StagePeriod[],
) {
  replaceStagePeriods(tx, schema, 'event-stage', eventUuid, periods);
}

export function getEventPeriods(eventUuid: string): StagePeriod[] {
  const { db, schema } = THEI_SERVER.useDb();
  return readStagePeriods(db, schema, 'event-stage', eventUuid);
}
