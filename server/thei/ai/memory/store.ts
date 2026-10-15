import { randomUUID } from 'node:crypto';
import { and, eq, inArray, or } from 'drizzle-orm';
import {
  AI_ANCHOR_MEMORY_MAX,
  AI_ENTITY_TYPES,
  type AiEntityType,
  type AiMemoryType,
} from '#layers/thei/shared/ai';
import {
  AI_MEMORY_TEXT_MAX,
  type AiMemoryItem,
} from '#layers/thei/shared/ai-memory';
import { EntityPrefix } from '../../entity-id';
import { refuse as fail } from '../../entity-patch/text';
import { findEntity, type EntityKey } from '../../entity-kinds';
import { findSession, sessionName } from '../sessions/store';
import { entityRef } from '../sessions/view';

/**
 * The AI's memory, as rows. A record is anchored to what it is about — one
 * entity, a pair of them, a kind of entity, or the owner — and is read only
 * with that. The owner's own words, «about you», are not a row: they are
 * the settings' `mcp.instructions`, read in every session.
 *
 * Facts about one anchor are kept short: past `AI_ANCHOR_MEMORY_MAX`
 * characters a new one is refused, and a model is told to propose
 * compacting what is there first.
 */

export type MemoryRow =
  typeof import('../../db/schema/ai').aiMemory.$inferSelect;

export type MemoryAnchor =
  | { anchor: 'owner' }
  | { anchor: 'entity'; entity: EntityKey }
  | { anchor: 'pair'; entity: EntityKey; other: EntityKey }
  | { anchor: 'kind'; kind: AiEntityType };

export function isMemoryKind(value: unknown): value is AiEntityType {
  return AI_ENTITY_TYPES.includes(value as AiEntityType) && value !== 'profile';
}

/** The columns an anchor is written in. */
export function anchorColumns(anchor: MemoryAnchor) {
  switch (anchor.anchor) {
    case 'owner':
      return { anchor: 'owner' as const, anchorType: '', anchorId: '' };
    case 'entity':
      return {
        anchor: 'entity' as const,
        anchorType: anchor.entity.kind,
        anchorId: anchor.entity.id,
      };
    case 'pair':
      return {
        anchor: 'pair' as const,
        anchorType: anchor.entity.kind,
        anchorId: anchor.entity.id,
        otherType: anchor.other.kind,
        otherId: anchor.other.id,
      };
    case 'kind':
      return { anchor: 'kind' as const, anchorType: anchor.kind, anchorId: '' };
  }
}

/** The rows of one anchor; a pair is the same pair read either way. */
function anchorWhere(schema: any, anchor: MemoryAnchor) {
  const t = schema.aiMemory;
  switch (anchor.anchor) {
    case 'owner':
      return eq(t.anchor, 'owner');
    case 'entity':
      return and(
        eq(t.anchor, 'entity'),
        eq(t.anchorType, anchor.entity.kind),
        eq(t.anchorId, anchor.entity.id),
      );
    case 'pair':
      return and(
        eq(t.anchor, 'pair'),
        or(
          and(
            eq(t.anchorType, anchor.entity.kind),
            eq(t.anchorId, anchor.entity.id),
            eq(t.otherType, anchor.other.kind),
            eq(t.otherId, anchor.other.id),
          ),
          and(
            eq(t.anchorType, anchor.other.kind),
            eq(t.anchorId, anchor.other.id),
            eq(t.otherType, anchor.entity.kind),
            eq(t.otherId, anchor.entity.id),
          ),
        ),
      );
    case 'kind':
      return and(eq(t.anchor, 'kind'), eq(t.anchorType, anchor.kind));
  }
}

export function anchorRows(anchor: MemoryAnchor): MemoryRow[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiMemory)
    .where(anchorWhere(schema, anchor))
    .orderBy(schema.aiMemory.createdAt)
    .all() as MemoryRow[];
}

/** The characters the facts among records take; a «never» takes none. */
export function factsSize(
  rows: readonly Pick<MemoryRow, 'type' | 'text'>[],
): number {
  return rows
    .filter((row) => row.type === 'fact')
    .reduce((sum, row) => sum + row.text.length, 0);
}

/** The anchor a row is written at, its entities found again. */
export function anchorOf(row: MemoryRow): MemoryAnchor | undefined {
  switch (row.anchor) {
    case 'owner':
      return { anchor: 'owner' };
    case 'kind':
      return isMemoryKind(row.anchorType)
        ? { anchor: 'kind', kind: row.anchorType }
        : undefined;
    case 'entity': {
      const entity = findEntity(`${row.anchorType}:${row.anchorId}`);
      return entity ? { anchor: 'entity', entity } : undefined;
    }
    case 'pair': {
      const entity = findEntity(`${row.anchorType}:${row.anchorId}`);
      const other = findEntity(`${row.otherType}:${row.otherId}`);
      return entity && other ? { anchor: 'pair', entity, other } : undefined;
    }
  }
}

function cleanText(text: unknown): string {
  const value =
    typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!value) fail('Say what to remember.');
  if (value.length > AI_MEMORY_TEXT_MAX)
    fail(
      `A record is a sentence or two: at most ${AI_MEMORY_TEXT_MAX} characters.`,
    );
  return value;
}

/** Refuses a fact the anchor has no room for. */
function assertRoom(anchor: MemoryAnchor, adding: number, without?: string) {
  const rows = anchorRows(anchor).filter((row) => row.memoryUuid !== without);
  if (factsSize(rows) + adding > AI_ANCHOR_MEMORY_MAX)
    fail(
      `Its memory is full (${AI_ANCHOR_MEMORY_MAX} characters): compact what is there first — propose memory-compact — or leave this out.`,
    );
}

function insertMemory(
  tx: any,
  anchor: MemoryAnchor,
  record: {
    type: AiMemoryType;
    text: string;
    fingerprint?: string;
    sessionUuid?: string | null;
  },
  now: number,
): string {
  const { schema } = THEI_SERVER.useDb();
  const memoryUuid = `${EntityPrefix.AiMemory}-${randomUUID()}`;
  tx.insert(schema.aiMemory)
    .values({
      memoryUuid,
      ...anchorColumns(anchor),
      type: record.type,
      text: record.text,
      fingerprint: record.fingerprint ?? null,
      sessionUuid: record.sessionUuid ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return memoryUuid;
}

export function addMemory(
  anchor: MemoryAnchor,
  input: { type?: AiMemoryType; text: unknown; sessionUuid?: string | null },
  now = Date.now(),
  tx?: any,
): string {
  if (anchor.anchor === 'owner' && (input.type ?? 'fact') === 'fact')
    fail('What to remember about the owner goes into «about you».');
  const text = cleanText(input.text);
  const type = input.type ?? 'fact';
  if (type === 'fact') assertRoom(anchor, text.length);
  return insertMemory(
    tx ?? THEI_SERVER.useDb().db,
    anchor,
    { type, text, sessionUuid: input.sessionUuid },
    now,
  );
}

/**
 * Never to offer an action again: a «never» in the site's own words, with
 * the fingerprint offers are told apart by — once, however often it is said.
 */
export function addNever(
  tx: any,
  anchor: MemoryAnchor,
  record: { fingerprint: string; text: string; sessionUuid: string },
  now = Date.now(),
) {
  const { schema } = THEI_SERVER.useDb();
  const exists = tx
    .select({ memoryUuid: schema.aiMemory.memoryUuid })
    .from(schema.aiMemory)
    .where(
      and(
        eq(schema.aiMemory.type, 'never'),
        eq(schema.aiMemory.fingerprint, record.fingerprint),
      ),
    )
    .get();
  if (!exists) insertMemory(tx, anchor, { type: 'never', ...record }, now);
}

export function findMemory(memoryUuid: string): MemoryRow | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiMemory)
    .where(eq(schema.aiMemory.memoryUuid, memoryUuid))
    .get() as MemoryRow | undefined;
}

export function updateMemory(
  memoryUuid: string,
  text: unknown,
  now = Date.now(),
): MemoryRow {
  const row = findMemory(memoryUuid) ?? fail('There is no such record.');
  const value = cleanText(text);
  const anchor = anchorOf(row);
  if (anchor && row.type === 'fact')
    assertRoom(anchor, value.length, memoryUuid);
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiMemory)
    .set({ text: value, updatedAt: now })
    .where(eq(schema.aiMemory.memoryUuid, memoryUuid))
    .run();
  return { ...row, text: value, updatedAt: now };
}

export function deleteMemory(memoryUuids: string[], tx?: any) {
  if (!memoryUuids.length) return;
  const { db, schema } = THEI_SERVER.useDb();
  (tx ?? db)
    .delete(schema.aiMemory)
    .where(inArray(schema.aiMemory.memoryUuid, memoryUuids))
    .run();
}

/** A row as the pages show it, its entities and session named. */
export function memoryItem(row: MemoryRow): AiMemoryItem {
  const anchor = anchorOf(row);
  const session = row.sessionUuid ? findSession(row.sessionUuid) : undefined;
  return {
    memoryUuid: row.memoryUuid,
    anchor: row.anchor,
    ...(anchor && (anchor.anchor === 'entity' || anchor.anchor === 'pair')
      ? { entity: entityRef(anchor.entity) }
      : {}),
    ...(anchor?.anchor === 'pair' ? { other: entityRef(anchor.other) } : {}),
    ...(anchor?.anchor === 'kind' ? { kind: anchor.kind } : {}),
    type: row.type,
    text: row.text,
    ...(session && !session.purgedAt
      ? {
          session: {
            sessionUuid: session.sessionUuid,
            title: sessionName(session),
          },
        }
      : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
