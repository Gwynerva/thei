import type { H3Event } from 'h3';
import { getHeader } from 'h3';
import { randomUUID } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import { getRequestIp, getRequestMeta, type RequestMeta } from '../request';
import {
  cleanupExpiredTokenAliases,
  clearTokenCookie,
  createToken,
  getTokenCookie,
  resolveToken,
  setTokenCookie,
  tokenAliases,
} from './token';
import {
  dbSnapshotInterval,
  maxDbSessions,
  sessionDuration,
  tokenAliasLifetime,
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
}

export const memorySessions = new Map<string, AdminSessionData>();
export const toSnapshotSessions = new Map<string, AdminSessionData>();

export function cloneSession(session: AdminSessionData): AdminSessionData {
  return structuredClone(session);
}

export function markSessionForSnapshot(session: AdminSessionData) {
  toSnapshotSessions.set(session.sessionUuid, cloneSession(session));
}

export async function createAdminSession(event: H3Event) {
  const now = Date.now();
  const token = createToken();
  const ip = getRequestIp(event);
  const ua = getHeader(event, 'user-agent');

  const session: AdminSessionData = {
    sessionUuid: randomUUID(),
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

  memorySessions.set(token, session);
  markSessionForSnapshot(session);
  setTokenCookie(event, token);

  await flushSessionsToDb();

  return session;
}

export async function destroyAdminSession(token: string) {
  token = resolveToken(token);
  const session = memorySessions.get(token);

  if (!session) {
    return;
  }

  session.state = 'destroyed';
  session.lastUsedAt = Date.now();

  markSessionForSnapshot(session);
  memorySessions.delete(token);

  for (const [oldToken, alias] of tokenAliases) {
    if (alias.token === token) {
      tokenAliases.delete(oldToken);
    }
  }

  await flushSessionsToDb();
}

export async function destroyCurrentAdminSession(event: H3Event) {
  const token = getTokenCookie(event);

  if (!token) {
    return;
  }

  await destroyAdminSession(token);
  clearTokenCookie(event);
}

export async function rotateAdminSessionTokenIfNeeded(
  event: H3Event,
  token: string,
  session: AdminSessionData,
) {
  const now = Date.now();

  if (now - session.tokenCreatedAt < tokenRotationInterval) {
    return session;
  }

  if (token !== session.token) {
    return session;
  }

  const oldToken = token;
  const newToken = createToken();

  session.token = newToken;
  session.tokenCreatedAt = now;
  session.lastUsedAt = now;

  memorySessions.set(newToken, session);

  tokenAliases.set(oldToken, {
    token: newToken,
    expiresAt: now + tokenAliasLifetime,
  });

  memorySessions.delete(oldToken);

  markSessionForSnapshot(session);

  setTokenCookie(event, newToken);

  return session;
}

export async function getCurrentAdminSession(event: H3Event) {
  cleanupExpiredTokenAliases();

  let token = getTokenCookie(event);

  if (!token) {
    return;
  }

  token = resolveToken(token);

  const session = memorySessions.get(token);

  if (!session) {
    clearTokenCookie(event);
    return;
  }

  const now = Date.now();

  if (now >= session.expiresAt) {
    await destroyCurrentAdminSession(event);
    return;
  }

  const currentSession = await rotateAdminSessionTokenIfNeeded(
    event,
    token,
    session,
  );

  const ip = getRequestIp(event);
  const ua = getHeader(event, 'user-agent');

  const needMetaUpdate = currentSession.ip !== ip || currentSession.ua !== ua;

  currentSession.ip = ip;
  currentSession.ua = ua;

  if (needMetaUpdate) {
    currentSession.meta = await getRequestMeta({
      ip,
      ua,
    });
  }

  if (
    event.path.startsWith('/admin/') ||
    event.path.startsWith('/api/admin/')
  ) {
    // Admin session is actually used
    currentSession.lastUsedAt = now;
    currentSession.expiresAt = now + sessionDuration;
  }

  markSessionForSnapshot(currentSession);

  return currentSession;
}

//
// Flushing sessions to the database
//

let flushRunning = false;

export async function flushSessionsToDb() {
  if (flushRunning) {
    return;
  }

  flushRunning = true;

  try {
    const pendingSessions = [...toSnapshotSessions.values()].map(cloneSession);

    for (const session of pendingSessions) {
      toSnapshotSessions.delete(session.sessionUuid);
    }

    const { db, schema } = THEI_SERVER.useDb();
    await db.transaction(async (transaction) => {
      for (const session of pendingSessions) {
        await transaction
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
          });
      }

      const sessions = await transaction
        .select()
        .from(schema.adminSessions)
        .orderBy(
          sql`json_extract(${schema.adminSessions.data}, '$.lastUsedAt') DESC`,
        );

      if (sessions.length > maxDbSessions) {
        const toDelete = sessions.slice(maxDbSessions);

        const uuids = toDelete.map((s) => s.sessionUuid);

        await transaction
          .delete(schema.adminSessions)
          .where(inArray(schema.adminSessions.sessionUuid, uuids));
      }
    });
  } finally {
    flushRunning = false;
  }
}

export async function loopAdminSessionSnapshotJob() {
  await flushSessionsToDb();
  setTimeout(loopAdminSessionSnapshotJob, dbSnapshotInterval);
}
