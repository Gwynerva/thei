/**
 * One change at a time per entity: an apply and an undo of the same entity
 * never interleave, while others go on side by side. Keys are taken in one
 * order, so two batches never wait on each other.
 */

import { findEntity, type EntityKey } from '../../entity-kinds';
import type { ActionRow } from './types';
import { targetOf } from './rows';

const tails = new Map<string, Promise<void>>();

/** An entity's lock, by kind and stored id: a diary entry by its day or id is one. */
function entityLock(key: Pick<EntityKey, 'kind' | 'id'>): string {
  return `${key.kind}:${key.id}`;
}

/**
 * The locks an action takes to be applied or undone: its target — for a
 * new entity, its kind — and a relation's other end, whose version moves too.
 */
export function actionLocks(
  row: Pick<ActionRow, 'kind' | 'payload' | 'targetType' | 'targetId'>,
  target: EntityKey | undefined = targetOf(row),
): string[] {
  const keys = target ? [entityLock(target)] : [`new:${row.kind}`];
  const payload = row.payload as { kind?: string; other?: string };
  if (payload.kind === 'relation' && payload.other) {
    const other = findEntity(payload.other);
    keys.push(other ? entityLock(other) : payload.other);
  }
  return keys;
}

export async function withEntityLocks<T>(
  keys: readonly string[],
  run: () => Promise<T>,
): Promise<T> {
  const sorted = [...new Set(keys)].sort();
  const releases: (() => void)[] = [];
  for (const key of sorted) {
    const previous = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const tail = previous.then(() => current);
    tails.set(key, tail);
    releases.push(() => {
      release();
      if (tails.get(key) === tail) tails.delete(key);
    });
    await previous;
  }
  try {
    return await run();
  } finally {
    for (const release of releases.reverse()) release();
  }
}
