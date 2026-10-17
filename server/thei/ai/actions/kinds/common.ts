import { refuse as fail } from '../../../entity-patch/text';
import type { EntityKey } from '../../../entity-kinds';
import { sameValue } from '../values';
import type { ActionEvaluation } from '../types';

/**
 * What the kinds of action say alike: the entity an action is about, a
 * value named in a line of a refusal or a summary, and where an action
 * stands by the value it sets.
 */

/** The entity an action is about: one without it is refused. */
export const target = (key: EntityKey | undefined) =>
  key ?? fail('This action is about an entity: name it.');

/** A value on one line, cut short with an ellipsis. */
export function clipped(value: string, length = 80): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > length ? `${line.slice(0, length - 1)}…` : line;
}

/**
 * Where an action stands by what it sets: done once it reads as the action
 * would leave it, open while it reads as when the action was made, stale
 * when it moved another way.
 */
export function standing(
  now: unknown,
  wanted: unknown,
  made: unknown,
  same: (left: unknown, right: unknown) => boolean = sameValue,
): ActionEvaluation {
  if (same(now, wanted)) return { state: 'done' };
  return same(now, made) ? { state: 'open' } : { state: 'stale' };
}
