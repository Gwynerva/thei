import type { H3Event } from 'h3';
import { getHeader } from 'h3';
import { inArray, sql } from 'drizzle-orm';
import { isAdminRequestPath } from '../../../shared/public-view';
import {
  getRequestIp,
  getRequestMeta,
  getRequestPath,
  type RequestMeta,
} from '../request';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import {
  clearTokenCookie,
  createToken,
  getTokenCookie,
  hashSessionToken,
  rotatedToken,
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
  /** The hash of the session's token (`hashSessionToken`), never the token. */
  tokenHash: string;
  tokenCreatedAt: number;
  /**
   * The hash of the token the last rotation replaced. The response that
   * carried the new one may never have reached the browser, so this one is
   * still accepted until the new one has been seen
   * (`rotateAdminSessionTokenIfNeeded`).
   */
  previousTokenHash?: string;
  /**
   * Set when the new token is first seen: the previous one is accepted until
   * then, for requests the browser sent before the new cookie arrived.
   */
  previousTokenExpiresAt?: number;
  /**
   * The salt the current token was made from the previous one with
   * (`rotatedToken`), kept until the browser has shown the current token:
   * meanwhile a request with the previous one is sent the current one again.
   */
  tokenSalt?: string;
}

/**
 * Active sessions by the hash of their token: of the current one, and of the
 * previous one while it may still be accepted.
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

function markSessionForSnapshot(session: AdminSessionData) {
  toSnapshotSessions.set(session.sessionUuid, cloneSession(session));
}

export function rememberSessionInMemory(session: AdminSessionData) {
  memorySessions.set(session.tokenHash, session);
  if (session.previousTokenHash !== undefined)
    memorySessions.set(session.previousTokenHash, session);
}

function removeSessionFromMemory(session: AdminSessionData) {
  for (const [tokenHash, memorySession] of memorySessions) {
    if (memorySession.sessionUuid === session.sessionUuid)
      memorySessions.delete(tokenHash);
  }
}

function forgetPreviousToken(session: AdminSessionData) {
  if (session.previousTokenHash === undefined) return;
  memorySessions.delete(session.previousTokenHash);
  delete session.previousTokenHash;
  delete session.previousTokenExpiresAt;
  delete session.tokenSalt;
}

/**
 * The session a token opens, by its hash: by its current token, or by the
 * previous one while that is still accepted. A previous token past its time
 * is forgotten.
 */
function findSessionByTokenHash(tokenHash: string, now: number) {
  const session = memorySessions.get(tokenHash);
  if (!session || tokenHash === session.tokenHash) return session;
  if (tokenHash !== session.previousTokenHash) {
    memorySessions.delete(tokenHash);
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

/**
 * Writes the sessions at once. A write that fails is logged, and what it
 * could not store waits for the next snapshot: a change of a session never
 * fails the request that made it.
 */
function writeSessionsNow(failure: string) {
  try {
    flushSessionsToDb();
  } catch (error) {
    THEI_SERVER.console.tag('Sessions').error(failure, error);
  }
}

function expireAdminSession(session: AdminSessionData, now = Date.now()) {
  if (session.state !== 'active' || now < session.expiresAt) return false;
  session.state = 'destroyed';
  removeSessionFromMemory(session);
  markSessionForSnapshot(session);
  return true;
}

export function expireAdminSessions(
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
  if (changed) writeSessionsNow('Could not write the expired admin sessions.');
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
    tokenHash: hashSessionToken(token),
    tokenCreatedAt: now,
  };

  rememberSessionInMemory(session);
  markSessionForSnapshot(session);
  setTokenCookie(event, token);

  flushSessionsToDb();

  return session;
}

function destroySession(session: AdminSessionData) {
  session.state = 'destroyed';
  session.lastUsedAt = Date.now();

  markSessionForSnapshot(session);
  removeSessionFromMemory(session);

  writeSessionsNow('Could not write a destroyed admin session.');
}

/** Ends an active session by its id. Returns whether there was one. */
export function destroyAdminSession(sessionUuid: string) {
  for (const session of memorySessions.values()) {
    if (session.sessionUuid !== sessionUuid) continue;
    destroySession(session);
    return true;
  }
  return false;
}

/** Destroy every other in-memory session while keeping the request session alive. */
export function destroyOtherAdminSessions(currentSessionUuid: string) {
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
  if (changed)
    writeSessionsNow('Could not write the destroyed admin sessions.');
  return changed;
}

export function destroyCurrentAdminSession(event: H3Event) {
  const token = getTokenCookie(event);

  if (!token) {
    return;
  }

  const session = findSessionByTokenHash(hashSessionToken(token), Date.now());
  if (session) destroySession(session);
  clearTokenCookie(event);
}

/**
 * Rotates the session's token once a day, through the cookie of the response.
 *
 * That response may never reach the browser: a reload, a navigation or a
 * closed tab aborts it, and the browser keeps the token it had. So the
 * replaced token stays on the session as `previousTokenHash`, and a request
 * that still carries it is accepted and answered with the current cookie
 * again — made anew from the token it carries, since only the hashes are
 * kept (`rotatedToken`). Once the current token comes back, the previous one
 * is accepted for `previousTokenGrace` more, for requests already on their
 * way, and then forgotten. Only then may the token rotate again, so the
 * browser always holds one of the two. Returns whether the token was rotated.
 */
function rotateAdminSessionTokenIfNeeded(
  event: H3Event,
  token: string,
  tokenHash: string,
  session: AdminSessionData,
  now: number,
) {
  if (tokenHash !== session.tokenHash) {
    // Once the current token has been seen there is no salt: the browser
    // holds the current token, and this request set out before its cookie
    // arrived.
    if (session.tokenSalt !== undefined)
      setTokenCookie(event, rotatedToken(token, session.tokenSalt));
    return false;
  }

  if (session.previousTokenHash !== undefined) {
    if (session.previousTokenExpiresAt === undefined) {
      session.previousTokenExpiresAt = now + previousTokenGrace;
      delete session.tokenSalt;
    } else if (now >= session.previousTokenExpiresAt)
      forgetPreviousToken(session);
  }

  if (
    session.previousTokenHash !== undefined ||
    now - session.tokenCreatedAt < tokenRotationInterval
  )
    return false;

  const tokenSalt = createToken();
  const newToken = rotatedToken(token, tokenSalt);

  session.previousTokenHash = tokenHash;
  session.tokenHash = hashSessionToken(newToken);
  session.tokenSalt = tokenSalt;
  session.tokenCreatedAt = now;
  session.lastUsedAt = now;

  memorySessions.set(session.tokenHash, session);

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
  const tokenHash = hashSessionToken(token);
  const session = findSessionByTokenHash(tokenHash, now);

  // A token no session knows leaves the cookie alone: a request the browser
  // held back past the grace of a rotation still carries the previous token,
  // and clearing the cookie would throw away the current one it holds now.
  if (!session) return;

  if (now >= session.expiresAt) {
    expireAdminSession(session, now);
    writeSessionsNow('Could not write an expired admin session.');
    clearTokenCookie(event);
    return;
  }

  // A new token is written at once, before anything is awaited: a restart
  // before the next snapshot would bring back the old one, which the browser
  // has replaced.
  if (rotateAdminSessionTokenIfNeeded(event, token, tokenHash, session, now)) {
    markSessionForSnapshot(session);
    writeSessionsNow('Could not write a rotated session token.');
  }

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

  if (isAdminRequestPath(getRequestPath(event))) {
    // Admin session is actually used
    session.lastUsedAt = now;
    session.expiresAt = now + sessionDuration;
  }

  markSessionForSnapshot(session);

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
