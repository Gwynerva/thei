import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, isNotNull, max, or, sql } from 'drizzle-orm';
import type {
  AiEntityType,
  AiMessagePart,
  AiMessageRole,
  AiSessionOrigin,
  AiTranscriptTurn,
} from '#layers/thei/shared/ai';
import { EntityPrefix } from '../../entity-id';

/**
 * Sessions and what is said in them, as stored: making one, adding to it,
 * keeping its counts and the entities it concerns up to date. What a session
 * is to the owner — its groups, its life, its end — is built on these.
 */

export type SessionRow =
  typeof import('../../db/schema/ai').aiSessions.$inferSelect;
export type MessageRow =
  typeof import('../../db/schema/ai').aiMessages.$inferSelect;

export interface NewSession {
  origin: AiSessionOrigin;
  title?: string;
  tokenUuid?: string;
  client?: string;
  templateId?: string;
  model?: string;
}

export function createSession(input: NewSession, now = Date.now()): string {
  const { db, schema } = THEI_SERVER.useDb();
  const sessionUuid = `${EntityPrefix.AiSession}-${randomUUID()}`;
  db.insert(schema.aiSessions)
    .values({
      sessionUuid,
      title: input.title ?? '',
      origin: input.origin,
      tokenUuid: input.tokenUuid ?? null,
      client: input.client ?? null,
      templateId: input.templateId ?? null,
      model: input.model ?? null,
      createdAt: now,
      lastActiveAt: now,
    })
    .run();
  return sessionUuid;
}

/**
 * What a session is called where another page names it as a source: its
 * title, or the name of the app that leads it.
 */
export function sessionName(row: Pick<SessionRow, 'title' | 'client'>): string {
  return row.title || row.client || '';
}

export function findSession(sessionUuid: string): SessionRow | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiSessions)
    .where(eq(schema.aiSessions.sessionUuid, sessionUuid))
    .get();
}

export interface NewMessage {
  role: AiMessageRole;
  text?: string;
  parts?: AiMessagePart[];
  transcript?: AiTranscriptTurn[];
  tokens?: number;
}

/** Adds a message at the end of a session, inside `tx`. */
export function insertMessage(
  tx: any,
  schema: any,
  sessionUuid: string,
  message: NewMessage,
  now = Date.now(),
): MessageRow {
  const last = tx
    .select({ seq: max(schema.aiMessages.seq) })
    .from(schema.aiMessages)
    .where(eq(schema.aiMessages.sessionUuid, sessionUuid))
    .get() as { seq: number | null } | undefined;
  const row = {
    messageUuid: `${EntityPrefix.AiMessage}-${randomUUID()}`,
    sessionUuid,
    seq: (last?.seq ?? 0) + 1,
    role: message.role,
    text: message.text ?? '',
    parts: message.parts ?? [],
    transcript: message.transcript ?? [],
    tokens: message.tokens ?? 0,
    createdAt: now,
  };
  tx.insert(schema.aiMessages).values(row).run();
  touchSession(tx, schema, sessionUuid, now);
  return row as MessageRow;
}

/**
 * A session spoken in or acted on lately is no longer archived — unless the
 * owner archived it, which only they undo.
 */
export function touchSession(
  tx: any,
  schema: any,
  sessionUuid: string,
  now = Date.now(),
) {
  const table = schema.aiSessions;
  tx.update(table)
    .set({
      lastActiveAt: now,
      archivedAt: sql`CASE WHEN ${table.closedAt} IS NULL THEN NULL ELSE ${table.archivedAt} END`,
    })
    .where(eq(schema.aiSessions.sessionUuid, sessionUuid))
    .run();
}

/**
 * Counts what waits for the owner in a session — actions not decided, a
 * question not answered — and what was applied and declined, onto its row.
 * A question waits only until the owner speaks: a message written on, not
 * as an answer, passes it over, and the model reads that message instead.
 */
export function refreshSessionCounts(
  tx: any,
  schema: any,
  sessionUuid: string,
) {
  const counts = tx
    .select({
      state: schema.aiActions.state,
      value: sql<number>`count(*)`,
    })
    .from(schema.aiActions)
    .where(eq(schema.aiActions.sessionUuid, sessionUuid))
    .groupBy(schema.aiActions.state)
    .all() as { state: string; value: number }[];
  const of = (state: string) =>
    counts.find((row) => row.state === state)?.value ?? 0;
  const spoke =
    (
      tx
        .select({ seq: max(schema.aiMessages.seq) })
        .from(schema.aiMessages)
        .where(
          and(
            eq(schema.aiMessages.sessionUuid, sessionUuid),
            eq(schema.aiMessages.role, 'owner'),
          ),
        )
        .get() as { seq: number | null } | undefined
    )?.seq ?? 0;
  const questions = (
    tx
      .select({ parts: schema.aiMessages.parts })
      .from(schema.aiMessages)
      .where(
        and(
          eq(schema.aiMessages.sessionUuid, sessionUuid),
          gt(schema.aiMessages.seq, spoke),
        ),
      )
      .all() as { parts: AiMessagePart[] }[]
  ).filter((row) =>
    row.parts.some((part) => part.type === 'question' && !part.answer),
  ).length;
  tx.update(schema.aiSessions)
    .set({
      waiting: of('pending') + questions,
      applied: of('applied'),
      rejected: of('rejected'),
    })
    .where(eq(schema.aiSessions.sessionUuid, sessionUuid))
    .run();
}

/**
 * Notes which entities a session concerns. An entity the owner attached or
 * named stays `about` it; anything read or acted on is `touched` unless it
 * already was `about`.
 */
export function linkSessionEntities(
  tx: any,
  schema: any,
  sessionUuid: string,
  entities: { type: AiEntityType; id: string; role: 'about' | 'touched' }[],
  now = Date.now(),
) {
  for (const entity of entities) {
    tx.insert(schema.aiSessionEntities)
      .values({
        sessionUuid,
        entityType: entity.type,
        entityId: entity.id,
        role: entity.role,
        at: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.aiSessionEntities.sessionUuid,
          schema.aiSessionEntities.entityType,
          schema.aiSessionEntities.entityId,
        ],
        set: entity.role === 'about' ? { role: 'about', at: now } : { at: now },
      })
      .run();
  }
}

/** The sessions that concern any of these entities. */
export function sessionsAbout(
  entities: { type: AiEntityType; id: string }[],
): string[] {
  if (!entities.length) return [];
  const { db, schema } = THEI_SERVER.useDb();
  const t = schema.aiSessionEntities;
  // By kind and id, as the index of what sessions are about is kept.
  return [
    ...new Set(
      db
        .select({ sessionUuid: t.sessionUuid })
        .from(t)
        .where(
          or(
            ...entities.map((entity) =>
              and(eq(t.entityType, entity.type), eq(t.entityId, entity.id)),
            ),
          ),
        )
        .all()
        .map((row) => row.sessionUuid),
    ),
  ];
}

/** What a message is now: its words, parts and turns as the model saw them. */
export function updateMessage(
  messageUuid: string,
  change: Partial<Pick<MessageRow, 'text' | 'parts' | 'transcript' | 'tokens'>>,
) {
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiMessages)
    .set(change)
    .where(eq(schema.aiMessages.messageUuid, messageUuid))
    .run();
}

export function findMessage(messageUuid: string): MessageRow | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiMessages)
    .where(eq(schema.aiMessages.messageUuid, messageUuid))
    .get();
}

/** A session's messages in order, after `afterSeq` when given. */
export function sessionMessages(
  sessionUuid: string,
  afterSeq = 0,
): MessageRow[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiMessages)
    .where(
      and(
        eq(schema.aiMessages.sessionUuid, sessionUuid),
        gt(schema.aiMessages.seq, afterSeq),
      ),
    )
    .orderBy(asc(schema.aiMessages.seq))
    .all();
}

/** Changes a session's own fields. */
export function updateSession(
  sessionUuid: string,
  change: Partial<
    Pick<
      SessionRow,
      | 'title'
      | 'state'
      | 'pinned'
      | 'error'
      | 'model'
      | 'closedAt'
      | 'archivedAt'
    >
  >,
) {
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiSessions)
    .set(change)
    .where(eq(schema.aiSessions.sessionUuid, sessionUuid))
    .run();
}

/**
 * Lets every session's chosen model go: names of one service mean nothing
 * to another, so once the connection speaks to another, sessions are
 * answered with its own model until the owner chooses again.
 */
export function forgetChosenModels() {
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiSessions)
    .set({ model: null })
    .where(isNotNull(schema.aiSessions.model))
    .run();
}

/** Adds what a turn spent to its session. */
export function addSessionTokens(sessionUuid: string, tokens: number) {
  if (!tokens) return;
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiSessions)
    .set({ tokens: sql`${schema.aiSessions.tokens} + ${tokens}` })
    .where(eq(schema.aiSessions.sessionUuid, sessionUuid))
    .run();
}

/** The entities a session is about, as the owner named them. */
export function sessionAbout(sessionUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({
      type: schema.aiSessionEntities.entityType,
      id: schema.aiSessionEntities.entityId,
    })
    .from(schema.aiSessionEntities)
    .where(
      and(
        eq(schema.aiSessionEntities.sessionUuid, sessionUuid),
        eq(schema.aiSessionEntities.role, 'about'),
      ),
    )
    .orderBy(asc(schema.aiSessionEntities.at))
    .all();
}
