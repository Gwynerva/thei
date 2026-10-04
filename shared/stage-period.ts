import type { DatedPeriod } from './date-precision';

export const STAGE_TYPES = ['project-stage', 'event-stage'] as const;

export type StageType = (typeof STAGE_TYPES)[number];

/**
 * One period of an event or a project stage: its dates, how sure they are,
 * and what that stretch was — "Studies", "Italy" — when the owner named it.
 * A label is optional; an empty one says nothing, and the dates speak alone.
 */
export type StagePeriod = DatedPeriod & { label: string };

export const STAGE_PERIOD_LABEL_MAX_LENGTH = 100;

export function normalizeStagePeriodLabel(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
