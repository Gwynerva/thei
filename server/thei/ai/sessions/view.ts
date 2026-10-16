import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  aiSessionStanding,
  type AiActionItem,
  type AiEntityRef,
  type AiEntityType,
  type AiMessageItem,
  type AiSessionDetail,
  type AiSessionItem,
  type AiSessionListResponse,
  type AiSessionOrigin,
  type AiSessionOverview,
} from '#layers/thei/shared/ai';
import { normalizeTermText } from '#layers/thei/shared/text-terms';
import {
  entityFace,
  findEntity,
  refOf,
  type EntityKey,
} from '../../entity-kinds';
import { settleActions } from '../actions/apply';
import { neverOffered } from '../actions/declined';
import { findActions, sessionActions } from '../actions/rows';
import { fileRef, isFileKey, type ActionTarget } from '../actions/target';
import { fileOfFamily } from '../../assets/descriptions';
import { AssetType } from '#layers/thei/shared/asset';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import type { ActionRow } from '../actions/types';
import { undoState } from '../actions/undo';
import { messageFromMarkdown } from '../../mcp/text-input';
import { writingOf } from './bus';
import { libraryFile, messageFiles } from './files';
import { sessionModel } from '../model/settings';
import {
  findMessage,
  findSession,
  sessionMessages,
  sessionsAbout,
  type MessageRow,
  type SessionRow,
} from './store';

/**
 * Sessions as the owner's page reads them: the list, one session whole, and
 * the pieces its event stream sends as they change.
 */

const PAGE = 50;

export function entityRef(key: EntityKey): AiEntityRef {
  const face = entityFace(key);
  return {
    ref: refOf(key),
    type: key.kind as AiEntityType,
    id: key.id,
    title: face?.title ?? '',
    ...(face ? { path: face.path } : {}),
  };
}

/** The refs an action's payload names besides its target. */
function refsIn(payload: unknown): Record<string, AiEntityRef> {
  const named = new Set<string>();
  const data = (payload ?? {}) as {
    other?: unknown;
    add?: { ref?: unknown }[];
    remove?: { ref?: unknown }[];
    fields?: { relations?: { ref?: unknown }[] };
  };
  if (typeof data.other === 'string') named.add(data.other);
  for (const item of [
    ...(data.add ?? []),
    ...(data.remove ?? []),
    ...(Array.isArray(data.fields?.relations) ? data.fields.relations : []),
  ])
    if (typeof item?.ref === 'string') named.add(item.ref);
  const refs: Record<string, AiEntityRef> = {};
  for (const ref of named) {
    const key = findEntity(ref);
    if (key) refs[ref] = entityRef(key);
  }
  return refs;
}

function aboutOf(sessionUuids: string[]): Map<string, AiEntityRef[]> {
  const about = new Map<string, AiEntityRef[]>();
  if (!sessionUuids.length) return about;
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.aiSessionEntities)
    .where(
      and(
        inArray(schema.aiSessionEntities.sessionUuid, sessionUuids),
        eq(schema.aiSessionEntities.role, 'about'),
      ),
    )
    .orderBy(schema.aiSessionEntities.at)
    .all();
  for (const row of rows) {
    const key = findEntity(`${row.entityType}:${row.entityId}`);
    if (!key) continue;
    const list = about.get(row.sessionUuid) ?? [];
    list.push(entityRef(key));
    about.set(row.sessionUuid, list);
  }
  return about;
}

function sessionItem(row: SessionRow, about: AiEntityRef[]): AiSessionItem {
  return {
    sessionUuid: row.sessionUuid,
    title: row.title,
    origin: row.origin,
    client: row.client,
    templateId: row.templateId,
    model: row.model,
    state: row.state,
    pinned: row.pinned,
    waiting: row.waiting,
    applied: row.applied,
    rejected: row.rejected,
    summary: row.summary,
    tokens: row.tokens,
    error: row.error,
    createdAt: row.createdAt,
    lastActiveAt: row.lastActiveAt,
    closedAt: row.closedAt,
    archivedAt: row.archivedAt,
    about,
  };
}

export function messageItem(row: MessageRow): AiMessageItem {
  // A message being written is given with all its words so far, saved or
  // not: the page reads them itself until the message is done.
  const writing = writingOf(row.messageUuid);
  return {
    messageUuid: row.messageUuid,
    seq: row.seq,
    role: row.role,
    text: writing ?? row.text,
    body:
      writing === undefined && row.text ? messageFromMarkdown(row.text) : null,
    parts: row.parts,
    files: messageFiles(row.parts),
    tokens: row.tokens,
    createdAt: row.createdAt,
  };
}

/** A file as a chip names it: what it is, its format and its size. */
function fileTitle(file: AssetVariantInfo): string {
  const said = THEI_SERVER.phrase;
  const kind = {
    [AssetType.Image]: said.image,
    [AssetType.Video]: said.video,
    [AssetType.Audio]: said.audio,
    [AssetType.Other]: said.asset,
  }[file.type];
  const size =
    file.size < 1024 * 1024
      ? `${Math.max(1, Math.round(file.size / 1024))} KB`
      : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  return `${kind} · ${file.extension.toUpperCase()} · ${size}`;
}

/**
 * The file an action is about, as the library has it now: the one named, or
 * another of its family when that one is gone.
 */
function actionFile(row: ActionRow, key: ActionTarget) {
  const family = (row.payload as { family?: string } | null)?.family;
  return (
    libraryFile(key.id) ??
    (family ? libraryFile(fileOfFamily(family) ?? '') : undefined)
  );
}

export async function actionItems(rows: ActionRow[]): Promise<AiActionItem[]> {
  const items: AiActionItem[] = [];
  const never = neverOffered(rows.map((row) => row.fingerprint));
  for (const row of rows) {
    const key: ActionTarget | undefined =
      row.targetType && row.targetId
        ? row.targetType === 'asset'
          ? { kind: 'asset', id: row.targetId }
          : (findEntity(`${row.targetType}:${row.targetId}`) ??
            ({ kind: row.targetType, id: row.targetId } as EntityKey))
        : undefined;
    const file = key && isFileKey(key) ? actionFile(row, key) : undefined;
    items.push({
      actionUuid: row.actionUuid,
      messageUuid: row.messageUuid,
      bundleUuid: row.bundleUuid,
      bundleOrder: row.bundleOrder,
      atomic: row.atomic,
      kind: row.kind,
      target: key
        ? isFileKey(key)
          ? {
              ref: fileRef(key.id),
              type: 'asset',
              id: key.id,
              title: file ? fileTitle(file) : key.id,
            }
          : entityRef(key)
        : null,
      ...(file ? { file } : {}),
      payload: row.payload,
      base: row.base,
      refs: refsIn(row.payload),
      parts: row.parts as AiActionItem['parts'],
      certainty: row.certainty,
      reason: row.reason,
      state: row.state,
      supersedes: row.supersedes,
      error: row.error,
      appliedBy: row.appliedBy,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      undo:
        row.state === 'applied' || (row.state === 'pending' && row.undo)
          ? await undoState(row)
          : null,
      never: never.has(row.fingerprint),
    });
  }
  return items;
}

/**
 * Whether the site's model answers in a session: an app's it does not, nor
 * one in the archive until it is brought back.
 */
export function sessionAnswerable(row: SessionRow): boolean {
  return (
    row.origin !== 'app' && !row.closedAt && !row.archivedAt && !row.purgedAt
  );
}

/** Words as a search compares them: case, «ё» and runs of space set aside. */
function searchable(value: string): string {
  return normalizeTermText(value).replace(/\s+/g, ' ').trim();
}

/** All that was said in each of these sessions, as one searchable text. */
function saidIn(sessionUuids: string[]): Map<string, string> {
  const { db, schema } = THEI_SERVER.useDb();
  const said = new Map<string, string>();
  if (!sessionUuids.length) return said;
  const rows = db
    .select({
      sessionUuid: schema.aiMessages.sessionUuid,
      text: schema.aiMessages.text,
    })
    .from(schema.aiMessages)
    .where(inArray(schema.aiMessages.sessionUuid, sessionUuids))
    .all();
  for (const row of rows)
    said.set(row.sessionUuid, `${said.get(row.sessionUuid) ?? ''} ${row.text}`);
  return said;
}

/**
 * The owner's sessions, the latest first, a page at a time: by where they
 * came from, archived or not, and by words of their title, summary, app or
 * of what was said in them.
 */
export function listSessions(
  filter: {
    origin?: AiSessionOrigin;
    archived?: boolean;
    waiting?: boolean;
    /** Only the sessions with something applied, or declined. */
    applied?: boolean;
    rejected?: boolean;
    /** Only the sessions of this access key. */
    tokenUuid?: string;
    /** Only the runs of this template. */
    templateId?: string;
    /** Only the sessions about this entity, or that touched it. */
    about?: Pick<EntityKey, 'kind' | 'id'>;
    q?: string;
    before?: number;
  } = {},
): AiSessionListResponse {
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiSessions;
  const words = searchable(filter.q ?? '');
  const about = filter.about
    ? sessionsAbout([{ type: filter.about.kind as never, id: filter.about.id }])
    : undefined;
  if (about && !about.length)
    return {
      sessions: [],
      modelReady: Boolean(sessionModel()),
      waiting: aiWaiting(),
    };
  const query = db
    .select()
    .from(table)
    .where(
      and(
        isNull(table.purgedAt),
        filter.origin ? eq(table.origin, filter.origin) : undefined,
        filter.archived === undefined
          ? undefined
          : filter.archived
            ? sql`${table.archivedAt} IS NOT NULL`
            : isNull(table.archivedAt),
        filter.waiting ? sql`${table.waiting} > 0` : undefined,
        filter.applied ? sql`${table.applied} > 0` : undefined,
        filter.rejected ? sql`${table.rejected} > 0` : undefined,
        filter.tokenUuid ? eq(table.tokenUuid, filter.tokenUuid) : undefined,
        filter.templateId ? eq(table.templateId, filter.templateId) : undefined,
        about ? inArray(table.sessionUuid, about) : undefined,
        filter.before ? lt(table.lastActiveAt, filter.before) : undefined,
      ),
    )
    .orderBy(desc(table.lastActiveAt));
  // Words are looked for here rather than in SQL, whose lower() knows only
  // Latin letters. Sessions are few — the quiet ones go to the archive in a
  // week and leave it in a month — so reading them whole costs little.
  let rows: (typeof table.$inferSelect)[];
  if (!words) rows = query.limit(PAGE + 1).all();
  else {
    const all = query.all();
    const said = saidIn(all.map((row) => row.sessionUuid));
    rows = all
      .filter((row) =>
        [row.title, row.summary, row.client, said.get(row.sessionUuid)].some(
          (value) => value && searchable(value).includes(words),
        ),
      )
      .slice(0, PAGE + 1);
  }
  const page = rows.slice(0, PAGE);
  const named = aboutOf(page.map((row) => row.sessionUuid));
  return {
    sessions: page.map((row) =>
      sessionItem(row, named.get(row.sessionUuid) ?? []),
    ),
    ...(rows.length > PAGE ? { next: page.at(-1)!.lastActiveAt } : {}),
    modelReady: Boolean(sessionModel()),
    waiting: aiWaiting(),
  };
}

/**
 * The latest sessions that wait for the owner, that work now, and that were
 * done within the week, archived ones aside: `room` of them in all, shared
 * evenly, what one kind cannot fill going to the others.
 */
export function sessionOverview(room = 9): AiSessionOverview {
  const now = Date.now();
  // What waits may be older than the latest page; it is read on its own.
  const latest = listSessions({ archived: false }).sessions;
  const waiting = listSessions({ archived: false, waiting: true }).sessions;
  const standing = (
    items: AiSessionItem[],
    wanted: ReturnType<typeof aiSessionStanding>,
  ) => items.filter((item) => aiSessionStanding(item, now) === wanted);
  const lists = [
    standing(waiting, 'waiting'),
    standing(latest, 'running'),
    standing(latest, 'recent'),
  ];
  const shown = shareRoom(
    lists.map((list) => list.length),
    room,
  );
  const [waitingShown, running, recent] = lists.map((list, index) =>
    list.slice(0, shown[index]),
  ) as [AiSessionItem[], AiSessionItem[], AiSessionItem[]];
  const { db, schema } = THEI_SERVER.useDb();
  return {
    total: Number(
      db
        .select({ total: sql<number>`count(*)` })
        .from(schema.aiSessions)
        .where(
          and(
            isNull(schema.aiSessions.purgedAt),
            isNull(schema.aiSessions.archivedAt),
          ),
        )
        .get()?.total ?? 0,
    ),
    waiting: waitingShown,
    running,
    recent,
  };
}

/**
 * How many of each list `room` places hold: even shares, and what a short
 * list leaves goes to the longer ones.
 */
function shareRoom(lengths: number[], room: number): number[] {
  const shown = lengths.map(() => 0);
  let left = room;
  for (;;) {
    const open = lengths
      .map((_, index) => index)
      .filter((index) => shown[index]! < lengths[index]!);
    if (!left || !open.length) return shown;
    const each = Math.max(1, Math.floor(left / open.length));
    for (const index of open) {
      const take = Math.min(each, lengths[index]! - shown[index]!, left);
      shown[index] = shown[index]! + take;
      left -= take;
    }
  }
}

/**
 * What waits for the owner across sessions: actions and questions. What an
 * archived session holds waits for nobody until it is brought back.
 */
export function aiWaiting(): number {
  const { db, schema } = THEI_SERVER.useDb();
  return Number(
    db
      .select({
        total: sql<number>`coalesce(sum(${schema.aiSessions.waiting}), 0)`,
      })
      .from(schema.aiSessions)
      .where(
        and(
          isNull(schema.aiSessions.purgedAt),
          isNull(schema.aiSessions.archivedAt),
        ),
      )
      .get()?.total ?? 0,
  );
}

export function sessionHead(sessionUuid: string): AiSessionItem | undefined {
  const row = findSession(sessionUuid);
  if (!row || row.purgedAt) return undefined;
  return sessionItem(row, aboutOf([sessionUuid]).get(sessionUuid) ?? []);
}

/**
 * One session whole — or, with `afterSeq`, the messages after the one a
 * page already has — its actions settled against the archive as it is now.
 */
export async function sessionDetail(
  sessionUuid: string,
  afterSeq = 0,
): Promise<AiSessionDetail | undefined> {
  const row = findSession(sessionUuid);
  if (!row || row.purgedAt) return undefined;
  const actions = await settleActions(sessionActions(sessionUuid));
  return {
    session: sessionHead(sessionUuid)!,
    messages: sessionMessages(sessionUuid, afterSeq).map(messageItem),
    actions: await actionItems(actions),
    answerable: sessionAnswerable(row),
  };
}

export async function actionsById(actionUuids: string[]) {
  return actionItems(findActions(actionUuids));
}

export function messageById(messageUuid: string) {
  const row = findMessage(messageUuid);
  return row ? messageItem(row) : undefined;
}
