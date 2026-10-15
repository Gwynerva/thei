import { and, eq, or } from 'drizzle-orm';
import { AI_ANCHOR_MEMORY_MAX } from '#layers/thei/shared/ai';
import type { AiEntityMemory } from '#layers/thei/shared/ai-memory';
import {
  entityFace,
  findEntity,
  refOf,
  type EntityKey,
} from '../../entity-kinds';
import { entityRef } from '../sessions/view';
import { digestOf } from '../digests';
import { factsSize, memoryItem, type MemoryRow } from './store';

/**
 * What a model reads of the memory with an entity: the records about it,
 * about it with another — the other named — and about every entity of its
 * kind. Nothing else: a record is read only with what it is about.
 */

export function memoryAbout(
  key: EntityKey,
  options: { kind?: boolean } = {},
): MemoryRow[] {
  const { db, schema } = THEI_SERVER.useDb();
  const t = schema.aiMemory;
  return db
    .select()
    .from(t)
    .where(
      or(
        and(
          eq(t.anchor, 'entity'),
          eq(t.anchorType, key.kind),
          eq(t.anchorId, key.id),
        ),
        and(
          eq(t.anchor, 'pair'),
          or(
            and(eq(t.anchorType, key.kind), eq(t.anchorId, key.id)),
            and(eq(t.otherType, key.kind), eq(t.otherId, key.id)),
          ),
        ),
        ...(options.kind === false
          ? []
          : [and(eq(t.anchor, 'kind'), eq(t.anchorType, key.kind))]),
      ),
    )
    .orderBy(t.createdAt)
    .all() as MemoryRow[];
}

/** The records about every entity of a kind. */
export function kindMemory(kind: string): MemoryRow[] {
  const { db, schema } = THEI_SERVER.useDb();
  const t = schema.aiMemory;
  return db
    .select()
    .from(t)
    .where(and(eq(t.anchor, 'kind'), eq(t.anchorType, kind)))
    .orderBy(t.createdAt)
    .all() as MemoryRow[];
}

/**
 * What is remembered about whole kinds of entity, for the overview a model
 * reads first: such a record holds wherever an entity of the kind comes up.
 */
export function kindMemoryOverview(): string[] {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.aiMemory)
    .where(eq(schema.aiMemory.anchor, 'kind'))
    .orderBy(schema.aiMemory.anchorType, schema.aiMemory.createdAt)
    .all() as MemoryRow[];
  if (!rows.length) return [];
  return [
    '',
    'About every entity of a kind:',
    ...rows.map(
      (row) =>
        `- every ${row.anchorType}${row.type === 'never' ? ', never to be offered' : ''}: ${row.text}`,
    ),
  ];
}

/** For a record of a pair, the other end, seen from `key`. */
function otherEnd(row: MemoryRow, key: EntityKey): string | undefined {
  if (row.anchor !== 'pair') return undefined;
  const near = row.anchorType === key.kind && row.anchorId === key.id;
  const other = near
    ? findEntity(`${row.otherType}:${row.otherId}`)
    : findEntity(`${row.anchorType}:${row.anchorId}`);
  if (!other) return undefined;
  const title = entityFace(other)?.title;
  return `${refOf(other)}${title ? ` (${title})` : ''}`;
}

/** The memory read with an entity, as a section of what a model reads. */
export function memoryLines(key: EntityKey): string[] {
  const rows = memoryAbout(key);
  if (!rows.length) return [];
  const line = (row: MemoryRow) => {
    const other = otherEnd(row, key);
    const about =
      row.anchor === 'kind'
        ? `every ${key.kind}: `
        : other
          ? `with ${other}: `
          : '';
    return `- ${about}${row.text}`;
  };
  const facts = rows.filter((row) => row.type === 'fact');
  const never = rows.filter((row) => row.type === 'never');
  return [
    ...(facts.length
      ? [
          '',
          '## What the owner asked to remember about it',
          '',
          ...facts.map(line),
        ]
      : []),
    ...(never.length
      ? ['', '## Never to be offered again', '', ...never.map(line)]
      : []),
  ];
}

/** An entity's memory and digest, as its form shows them. */
export function entityMemory(key: EntityKey): AiEntityMemory {
  const rows = memoryAbout(key, { kind: false });
  const digest = digestOf(key);
  return {
    entity: entityRef(key),
    items: rows.map(memoryItem),
    size: factsSize(rows.filter((row) => row.anchor === 'entity')),
    max: AI_ANCHOR_MEMORY_MAX,
    ...(digest ? { digest } : {}),
  };
}
