/**
 * One change at a time per entity: an apply and an undo of the same entity
 * never interleave, while others go on side by side. Keys are taken in one
 * order, so two batches never wait on each other.
 */

import { isRelationEntityType } from '#layers/thei/shared/relation';
import { readRelationRows } from '../../relations';
import { findEntity, formOwnerOf, type EntityKey } from '../../entity-kinds';
import { isFileKey, type ActionTarget } from './target';
import type { ActionRow } from './types';
import { targetOf } from './rows';

const tails = new Map<string, Promise<void>>();

/** An entity's lock, by kind and stored id: a diary entry by its day or id is one. */
function entityLock(key: Pick<ActionTarget, 'kind' | 'id'>): string {
  return `${key.kind}:${key.id}`;
}

type LockedRow = Pick<
  ActionRow,
  'kind' | 'payload' | 'targetType' | 'targetId'
>;

/**
 * The entities besides its own form whose versions an action moves: a
 * relation's other end, the ends of the relations a change or a new entity
 * lists — and, for a list given whole, or a deletion, those its target has
 * now, which it may take away.
 */
export function relationEnds(row: LockedRow): EntityKey[] {
  const payload = (row.payload ?? {}) as {
    kind?: string;
    other?: unknown;
    changes?: { relations?: unknown };
    fields?: { relations?: unknown };
  };
  const refs: unknown[] = [];
  if (payload.kind === 'relation') refs.push(payload.other);
  const listed =
    payload.kind === 'update'
      ? payload.changes?.relations
      : payload.kind === 'create'
        ? payload.fields?.relations
        : undefined;
  if (Array.isArray(listed))
    for (const item of listed) refs.push((item as { ref?: unknown })?.ref);
  const ends = refs.flatMap((ref) => findEntity(ref) ?? []);
  const target = targetOf(row);
  if (
    target &&
    !isFileKey(target) &&
    isRelationEntityType(target.kind) &&
    ((payload.kind === 'update' && listed !== undefined) ||
      payload.kind === 'delete')
  )
    for (const item of readRelationRows({ type: target.kind, id: target.id }))
      // Found again, a diary entry with its day: what its form is known by.
      ends.push(
        findEntity(`${item.other.type}:${item.other.id}`) ?? {
          kind: item.other.type,
          id: item.other.id,
        },
      );
  return ends;
}

/**
 * The locks an action takes to be applied or undone: the form it writes —
 * its target's, a section's project's — or, for a new entity, its kind, and
 * the other ends of the relations it moves.
 */
export function actionLocks(
  row: LockedRow,
  target: ActionTarget | undefined = targetOf(row),
): string[] {
  const form =
    target && !isFileKey(target) ? (formOwnerOf(target) ?? target) : target;
  const keys = form ? [entityLock(form)] : [`new:${row.kind}`];
  for (const end of relationEnds(row)) keys.push(entityLock(end));
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
