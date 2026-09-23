import { isLifeDay } from './life';

/**
 * A diary entry is addressed by its day and nothing else.
 *
 * Projects and events carry a public ID in their address because more than one
 * of them can share a name. A day is already unique, so the address stays as
 * short as the entity is simple.
 */
export function buildDiaryUrl(date: string): string {
  return `/diary/${date}/`;
}

/** The day an address names, or `undefined` if it names no real day. */
export function dateFromDiaryUrlPart(value: string): string | undefined {
  const date = value.trim();
  return isLifeDay(date) ? date : undefined;
}
