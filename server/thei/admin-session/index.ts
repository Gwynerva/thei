import type { H3Event } from 'h3';
import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { debounce } from 'perfect-debounce';
import { getRequestMeta, type RequestMeta } from '../request';
import {
  clearTokenCookie,
  createToken,
  getTokenCookie,
  setTokenCookie,
} from './token';
import {
  maxDbSessions,
  sessionDuration,
  sessionSyncDebounce,
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
  __updateMeta?: boolean;
}

export const memorySessions = new Map<string, AdminSessionData>();
export const syncRequests = new Map<string, Promise<void>>();

async function syncSessionWithDb(session: AdminSessionData) {
  if (session.__updateMeta) {
    session.meta = await getRequestMeta({ ip: session.ip, ua: session.ua });
    delete session.__updateMeta;
  }

  const { db, schema } = THEI_SERVER.useDb();
  await db
    .update(schema.adminSessions)
    .set({ data: session })
    .where(eq(schema.adminSessions.sessionUuid, session.sessionUuid));
}

function requestSessionSync(session: AdminSessionData) {
  const sessionUuid = session.sessionUuid;

  const existingRequest = syncRequests.get(sessionUuid);
  if (existingRequest) {
    return existingRequest;
  }

  const task = (async () => {
    try {
      await debounce(async () => {
        await syncSessionWithDb(session);
      }, sessionSyncDebounce)();
    } finally {
      syncRequests.delete(sessionUuid);
    }
  })();

  syncRequests.set(sessionUuid, task);
  return task;
}

export async function createAdminSession(event: H3Event) {
  const now = Date.now();
  const token = createToken();
  const ip = getRequestIP(event);
  const ua = getHeader(event, 'user-agent');

  const session: AdminSessionData = {
    sessionUuid: randomUUID(),
    state: 'active',
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + sessionDuration,
    ip,
    ua,
    meta: await getRequestMeta({ ip, ua }),
    token,
    tokenCreatedAt: now,
  };

  const { db, schema } = THEI_SERVER.useDb();
  await db.insert(schema.adminSessions).values({
    sessionUuid: session.sessionUuid,
    data: session,
  });

  memorySessions.set(token, session);
  setTokenCookie(event, token);
  await enforceDbLimit();

  return session;
}

export async function destroyAdminSession(token: string) {
  const session = memorySessions.get(token);

  if (!session) {
    return;
  }

  const { db, schema } = THEI_SERVER.useDb();
  await db
    .update(schema.adminSessions)
    .set({ data: { ...session, state: 'destroyed' } })
    .where(eq(schema.adminSessions.sessionUuid, session.sessionUuid));

  memorySessions.delete(token);
  syncRequests.delete(session.sessionUuid);
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
    return;
  }

  const newToken = createToken();

  const rotated: AdminSessionData = {
    ...session,
    token: newToken,
    tokenCreatedAt: now,
    lastUsedAt: now,
  };

  await syncSessionWithDb(rotated);

  memorySessions.set(newToken, rotated);
  memorySessions.delete(token);
  setTokenCookie(event, newToken);
}

export async function isAdminSession(event: H3Event) {
  const token = getTokenCookie(event);

  if (!token) {
    return false;
  }

  const session = memorySessions.get(token);

  if (!session) {
    clearTokenCookie(event);
    return false;
  }

  const now = Date.now();

  if (now >= session.expiresAt) {
    await destroyCurrentAdminSession(event);
    return false;
  }

  await rotateAdminSessionTokenIfNeeded(event, token, session);

  if (
    event.path.startsWith('/admin/') ||
    event.path.startsWith('/api/admin/')
  ) {
    const ip = getRequestIP(event);
    const ua = getHeader(event, 'user-agent');
    const needMetaUpdate = session.ip !== ip || session.ua !== ua;

    session.ip = ip;
    session.ua = ua;

    if (needMetaUpdate) {
      session.__updateMeta = true;
    }

    session.lastUsedAt = now;
    session.expiresAt = now + sessionDuration;

    requestSessionSync(session);
  }

  return true;
}

export async function enforceDbLimit() {
  const { db, schema } = THEI_SERVER.useDb();

  const sessions = await db
    .select()
    .from(schema.adminSessions)
    .orderBy(sql`json_extract(${schema.adminSessions.data}, '$.lastUsedAt')`);

  if (sessions.length <= maxDbSessions) {
    return;
  }

  const toDelete = sessions.slice(0, sessions.length - maxDbSessions);
  const uuids = toDelete.map((s) => s.sessionUuid);

  await db
    .delete(schema.adminSessions)
    .where(inArray(schema.adminSessions.sessionUuid, uuids));
}
