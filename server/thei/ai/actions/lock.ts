/**
 * One change at a time per entity: an apply and an undo of the same entity
 * never interleave, while others go on side by side. Keys are taken in one
 * order, so two batches never wait on each other.
 */

import { and, eq } from 'drizzle-orm';
import { isExcerptParentType } from '#layers/thei/shared/excerpt';
import { isRelationEntityType } from '#layers/thei/shared/relation';
import { readRelationRows } from '../../relations';
import { excerptRelationRowsOf } from '../../excerpts';
import { readExcerptSubjects } from '../../excerpts/subjects';
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

type Payload = {
  kind?: string;
  other?: unknown;
  changes?: Record<string, unknown>;
  fields?: Record<string, unknown>;
};

/** The refs of a list of items, each `{ ref }`. */
function refsOfItems(value: unknown): unknown[] {
  return Array.isArray(value)
    ? value.map((item) => (item as { ref?: unknown } | null)?.ref)
    : [];
}

/** The ref of an excerpt's subject as a change gives it, `{ ref }`. */
function subjectRef(value: unknown): unknown[] {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? [(value as { ref?: unknown }).ref]
    : [];
}

/**
 * The refs a change or a new entity names as the other ends of relations:
 * those it lists, an excerpt's subject, the subjects of a parent's
 * excerpts — and a relation's other end.
 */
export function namedRelationRefs(payload: unknown): unknown[] {
  const data = (payload ?? {}) as Payload;
  if (data.kind === 'relation') return [data.other];
  const given =
    data.kind === 'update'
      ? data.changes
      : data.kind === 'create'
        ? data.fields
        : undefined;
  if (!given) return [];
  return [
    ...refsOfItems(given.relations),
    ...subjectRef(given.subject),
    ...(Array.isArray(given.excerpts)
      ? given.excerpts.flatMap((item) =>
          subjectRef((item as { subject?: unknown } | null)?.subject),
        )
      : []),
  ];
}

/** An end as its form is known by: a diary entry found again with its day. */
function endKey(end: { type: string; id: string }): EntityKey {
  return (
    findEntity(`${end.type}:${end.id}`) ?? {
      kind: end.type as EntityKey['kind'],
      id: end.id,
    }
  );
}

/**
 * The excerpts whose subject a change may move away from what it is now:
 * an excerpt's own, or those of a parent it names by id.
 */
function excerptsResubjected(
  payload: Payload,
  target: EntityKey | undefined,
): string[] {
  if (payload.kind !== 'update' || !target) return [];
  const changes = payload.changes ?? {};
  if (target.kind === 'excerpt') return 'subject' in changes ? [target.id] : [];
  if (!isExcerptParentType(target.kind) || !Array.isArray(changes.excerpts))
    return [];
  return changes.excerpts.flatMap((item) => {
    const change = (item ?? {}) as { id?: unknown; subject?: unknown };
    return typeof change.id === 'string' && 'subject' in change
      ? [change.id]
      : [];
  });
}

/**
 * The entities besides its own form whose versions an action moves: a
 * relation's other end, the ends of the relations a change or a new entity
 * lists, an excerpt's subject — the one it is given and the one it leaves —
 * and, for a list given whole, or a deletion, those its target has now,
 * which it may take away. A deletion of what excerpts are about moves
 * their parents too, and of a parent, what its excerpts are about.
 */
export function relationEnds(row: LockedRow): EntityKey[] {
  const payload = (row.payload ?? {}) as Payload;
  const ends = namedRelationRefs(payload).flatMap(
    (ref) => findEntity(ref) ?? [],
  );
  const target = targetOf(row);
  const entity = target && !isFileKey(target) ? target : undefined;
  const listed =
    payload.kind === 'update'
      ? payload.changes?.relations
      : payload.kind === 'create'
        ? payload.fields?.relations
        : undefined;
  if (
    entity &&
    isRelationEntityType(entity.kind) &&
    ((payload.kind === 'update' && listed !== undefined) ||
      payload.kind === 'delete')
  )
    for (const item of readRelationRows({ type: entity.kind, id: entity.id }))
      ends.push(endKey(item.other));
  const { db, schema } = THEI_SERVER.useDb();
  const left = excerptsResubjected(payload, entity);
  if (payload.kind === 'delete' && entity && isExcerptParentType(entity.kind)) {
    for (const { excerptUuid } of excerptRelationRowsOf(db, schema, {
      type: entity.kind,
      id: entity.id,
    })) {
      const parent = formOwnerOf({ kind: 'excerpt', id: excerptUuid });
      if (parent) ends.push(parent);
    }
    for (const excerpt of db
      .select({ excerptUuid: schema.excerpts.excerptUuid })
      .from(schema.excerpts)
      .where(
        and(
          eq(schema.excerpts.parentType, entity.kind),
          eq(schema.excerpts.parentId, entity.id),
        ),
      )
      .all())
      left.push(excerpt.excerptUuid);
  }
  for (const subject of readExcerptSubjects(db, schema, left).values())
    ends.push(endKey(subject));
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
