import type { H3Event } from 'h3';
import { getHeader } from 'h3';
import { inArray, sql } from 'drizzle-orm';
import { getRequestIp, getRequestMeta, type RequestMeta } from '../request';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import {
  clearTokenCookie,
  createToken,
  getTokenCookie,
  setTokenCookie,
} from './token';
import {
  dbSnapshotInterval,
  maxDbSessions,
  previousTokenGrace,
  sessionDuration,
  tokenRotationInterval,
} from './const';

export type AdminSessionState = 'active' | 'destroyed';

export interface AdminSessionData {
  sessionUuid: string;
  state: AdminSessionState;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  ip?: string;
  ua?: string;
  meta: RequestMeta;
  token: string;
  tokenCreatedAt: number;
  /**
   * The token the last rotation replaced. The response that carried the new
   * one may never have reached the browser, so this one is still accepted
   * until the new one has been seen (`rotateAdminSessionTokenIfNeeded`).
   */
  previousToken?: string;
  /**
   * Set when the new token is first seen: the previous one is accepted until
   * then, for requests the browser sent before the new cookie arrived.
   */
  previousTokenExpiresAt?: number;
}

/**
 * Active sessions by token: by the current one, and by the previous one while
 * it may still be accepted.
 */
export const memorySessions = new Map<string, AdminSessionData>();
export const toSnapshotSessions = new Map<string, AdminSessionData>();

/**
 * Set once the sessions have been read from the database. Before that — while
 * the site is closed for an update, or after a boot that stopped — nobody can
 * be recognised, and a session cookie must not be taken for a stale one.
 */
let sessionsLoaded = false;

export function markAdminSessionsLoaded() {
  sessionsLoaded = true;
}

export function adminSessionsLoaded() {
  return sessionsLoaded;
}

export function cloneSession(session: AdminSessionData): AdminSessionData {
  return structuredClone(session);
}

export function markSessionForSnapshot(session: AdminSessionData) {
  toSnapshotSessions.set(session.sessionUuid, cloneSession(session));
}

export function rememberSessionInMemory(session: AdminSessionData) {
  memorySessions.set(session.token, session);
  if (session.previousToken !== undefined)
    memorySessions.set(session.previousToken, session);
}

function removeSessionFromMemory(session: AdminSessionData) {
  for (const [token, memorySession] of memorySessions) {
    if (memorySession.sessionUuid === session.sessionUuid)
      memorySessions.delete(token);
  }
}

function forgetPreviousToken(session: AdminSessionData) {
  if (session.previousToken === undefined) return;
  memorySessions.delete(session.previousToken);
  delete session.previousToken;
  delete session.previousTokenExpiresAt;
}

/**
 * The session a token opens: by its current token, or by the previous one
 * while that is still accepted. A previous token past its time is forgotten.
 */
function findSessionByToken(token: string, now: number) {
  const session = memorySessions.get(token);
  if (!session || token === session.token) return session;
  if (token !== session.previousToken) {
    memorySessions.delete(token);
    return undefined;
  }
  if (
    session.previousTokenExpiresAt === undefined ||
    now < session.previousTokenExpiresAt
  )
    return session;
  forgetPreviousToken(session);
  markSessionForSnapshot(session);
  return undefined;
}

export function expireAdminSession(
  session: AdminSessionData,
  now = Date.now(),
) {
  if (session.state !== 'active' || now < session.expiresAt) return false;
  session.state = 'destroyed';
  removeSessionFromMemory(session);
  markSessionForSnapshot(session);
  return true;
}

export async function expireAdminSessions(
  sessions: Iterable<AdminSessionData>,
  now = Date.now(),
) {
  let changed = false;
  const seen = new Set<string>();
  for (const session of sessions) {
    if (seen.has(session.sessionUuid)) continue;
    seen.add(session.sessionUuid);
    changed = expireAdminSession(session, now) || changed;
  }
  if (changed) flushSessionsToDb();
  return changed;
}

export async function createAdminSession(event: H3Event) {
  const now = Date.now();
  const token = createToken();
  const ip = getRequestIp(event);
  const ua = getHeader(event, 'user-agent');

  const sessionUuid = await generateUniqueId(
    EntityPrefix.Session,
    async (id) =>
      !Array.from(memorySessions.values()).some((s) => s.sessionUuid === id),
  );

  const session: AdminSessionData = {
    sessionUuid,
    state: 'active',
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + sessionDuration,
    ip,
    ua,
    meta: await getRequestMeta({
      ip,
      ua,
    }),
    token,
    tokenCreatedAt: now,
  };

  rememberSessionInMemory(session);
  markSessionForSnapshot(session);
  setTokenCookie(event, token);

  flushSessionsToDb();

  return session;
}

export async function destroyAdminSession(token: string) {
  const session = findSessionByToken(token, Date.now());

  if (!session) {
    return;
  }

  session.state = 'destroyed';
  session.lastUsedAt = Date.now();

  markSessionForSnapshot(session);
  removeSessionFromMemory(session);

  flushSessionsToDb();
}

/** Destroy every other in-memory session while keeping the request session alive. */
export async function destroyOtherAdminSessions(currentSessionUuid: string) {
  const now = Date.now();
  const seen = new Set<string>();
  let changed = false;
  for (const session of [...memorySessions.values()]) {
    if (
      session.sessionUuid === currentSessionUuid ||
      seen.has(session.sessionUuid)
    )
      continue;
    seen.add(session.sessionUuid);
    session.state = 'destroyed';
    session.lastUsedAt = now;
    markSessionForSnapshot(session);
    removeSessionFromMemory(session);
    changed = true;
  }
  if (changed) flushSessionsToDb();
  return changed;
}

export async function destroyCurrentAdminSession(event: H3Event) {
  const token = getTokenCookie(event);

  if (!token) {
    return;
  }

  await destroyAdminSession(token);
  clearTokenCookie(event);
}

/**
 * Rotates the session's token once a day, through the cookie of the response.
 *
 * That response may never reach the browser: a reload, a navigation or a
 * closed tab aborts it, and the browser keeps the token it had. So the
 * replaced token stays on the session as `previousToken`, and a request that
 * still carries it is accepted and answered with the current cookie again.
 * Once the current token comes back, the previous one is accepted for
 * `previousTokenGrace` more, for requests already on their way, and then
 * forgotten. Only then may the token rotate again, so the browser always
 * holds one of the two. Returns whether the token was rotated.
 */
export function rotateAdminSessionTokenIfNeeded(
  event: H3Event,
  token: string,
  session: AdminSessionData,
  now = Date.now(),
) {
  if (token !== session.token) {
    setTokenCookie(event, session.token);
    return false;
  }

  if (session.previousToken !== undefined) {
    if (session.previousTokenExpiresAt === undefined)
      session.previousTokenExpiresAt = now + previousTokenGrace;
    else if (now >= session.previousTokenExpiresAt)
      forgetPreviousToken(session);
  }

  if (
    session.previousToken !== undefined ||
    now - session.tokenCreatedAt < tokenRotationInterval
  )
    return false;

  const newToken = createToken();

  session.previousToken = token;
  session.token = newToken;
  session.tokenCreatedAt = now;
  session.lastUsedAt = now;

  memorySessions.set(newToken, session);

  setTokenCookie(event, newToken);

  return true;
}

export async function getCurrentAdminSession(event: H3Event) {
  if (!sessionsLoaded) {
    return;
  }

  const token = getTokenCookie(event);

  if (!token) {
    return;
  }

  const now = Date.now();
  const session = findSessionByToken(token, now);

  if (!session) {
    clearTokenCookie(event);
    return;
  }

  if (now >= session.expiresAt) {
    expireAdminSession(session, now);
    flushSessionsToDb();
    clearTokenCookie(event);
    return;
  }

  const rotated = rotateAdminSessionTokenIfNeeded(event, token, session, now);

  const ip = getRequestIp(event);
  const ua = getHeader(event, 'user-agent');

  const needMetaUpdate = session.ip !== ip || session.ua !== ua;

  session.ip = ip;
  session.ua = ua;

  if (needMetaUpdate) {
    session.meta = await getRequestMeta({
      ip,
      ua,
    });
  }

  if (
    event.path.startsWith('/admin/') ||
    event.path.startsWith('/api/admin/')
  ) {
    // Admin session is actually used
    session.lastUsedAt = now;
    session.expiresAt = now + sessionDuration;
  }

  markSessionForSnapshot(session);

  // A new token is written at once: a restart before the next snapshot would
  // bring back the old one, which the browser has replaced.
  if (rotated) {
    try {
      flushSessionsToDb();
    } catch (error) {
      THEI_SERVER.console
        .tag('Sessions')
        .error('Could not write a rotated session token.', error);
    }
  }

  return session;
}

//
// Flushing sessions to the database
//

/**
 * Writes the sessions changed since the last write. Synchronous, so it can
 * run while the process exits. Sessions a failed write could not store wait
 * for the next one.
 */
export function flushSessionsToDb() {
  if (toSnapshotSessions.size === 0) return;

  const pendingSessions = [...toSnapshotSessions.values()];
  toSnapshotSessions.clear();

  try {
    const { db, schema } = THEI_SERVER.useDb();
    db.transaction((transaction) => {
      for (const session of pendingSessions) {
        transaction
          .insert(schema.adminSessions)
          .values({
            sessionUuid: session.sessionUuid,
            data: session,
          })
          .onConflictDoUpdate({
            target: schema.adminSessions.sessionUuid,
            set: {
              data: session,
            },
          })
          .run();
      }

      const sessions = transaction
        .select()
        .from(schema.adminSessions)
        .orderBy(
          sql`json_extract(${schema.adminSessions.data}, '$.lastUsedAt') DESC`,
        )
        .all();

      if (sessions.length > maxDbSessions) {
        const toDelete = sessions.slice(maxDbSessions);

        const uuids = toDelete.map((s) => s.sessionUuid);

        transaction
          .delete(schema.adminSessions)
          .where(inArray(schema.adminSessions.sessionUuid, uuids))
          .run();
      }
    });
  } catch (error) {
    for (const session of pendingSessions) {
      if (!toSnapshotSessions.has(session.sessionUuid))
        toSnapshotSessions.set(session.sessionUuid, session);
    }
    throw error;
  }
}

export function loopAdminSessionSnapshotJob() {
  try {
    flushSessionsToDb();
  } catch (error) {
    THEI_SERVER.console
      .tag('Sessions')
      .error('Could not write the admin sessions.', error);
  }
  setTimeout(loopAdminSessionSnapshotJob, dbSnapshotInterval);
}

/**
 * Writes what changed since the last snapshot — the last uses and expiries —
 * when the server stops. A new token is already written when it is made.
 */
export function flushSessionsBeforeExit() {
  try {
    flushSessionsToDb();
  } catch (error) {
    THEI_SERVER.console
      .tag('Sessions')
      .error('Could not write the admin sessions before exit.', error);
  }
}
