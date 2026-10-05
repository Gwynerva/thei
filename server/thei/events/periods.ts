import type { Period } from '#layers/thei/shared/period';
import { readPeriods, replacePeriods } from '../periods';

export function applyEventPeriods(
  tx: any,
  schema: any,
  eventUuid: string,
  periods: Period[],
) {
  replacePeriods(tx, schema, 'event', eventUuid, periods);
}

export function getEventPeriods(eventUuid: string): Period[] {
  const { db, schema } = THEI_SERVER.useDb();
  return readPeriods(db, schema, 'event', eventUuid);
}
