import { refuse as fail } from '../../../entity-patch/text';
import type { EntityKey } from '../../../entity-kinds';

/**
 * What the kinds of action say alike: the entity an action is about, and a
 * value named in a line of a refusal or a summary.
 */

/** The entity an action is about: one without it is refused. */
export const target = (key: EntityKey | undefined) =>
  key ?? fail('This action is about an entity: name it.');

/** A value on one line, cut short with an ellipsis. */
export function clipped(value: string, length = 80): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > length ? `${line.slice(0, length - 1)}…` : line;
}
