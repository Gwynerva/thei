import type { H3Event } from 'h3';
import {
  cloneSession,
  expireAdminSessions,
  memorySessions,
  type AdminSessionData,
  type AdminSessionState,
} from '..';
import type { RequestMeta } from '../../request';

export interface PublicAdminSession {
  sessionUuid: string;
  current: boolean;
  state: AdminSessionState;
  createdAt: number;
  lastUsedAt: number;
  ip?: string;
  meta: RequestMeta;
}

export function toPublicAdminSession(
  session: AdminSessionData,
  currentSessionUuid?: string,
): PublicAdminSession {
  return {
    sessionUuid: session.sessionUuid,
    current: session.sessionUuid === currentSessionUuid,
    state: session.state,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    ip: session.ip,
    meta: session.meta,
  };
}

export async function getPublicAdminSessions(
  event?: H3Event,
): Promise<PublicAdminSession[]> {
  const currentSessionUuid = event
    ? (await THEI_SERVER.getAdmin(event))?.sessionUuid
    : undefined;

  const { db, schema } = THEI_SERVER.useDb();
  const dbSessions = await db.select().from(schema.adminSessions);
  const sessionsByUuid = new Map(
    dbSessions.map((row) => [row.sessionUuid, row.data]),
  );
  for (const session of memorySessions.values()) {
    sessionsByUuid.set(session.sessionUuid, session);
  }

  await expireAdminSessions(sessionsByUuid.values());

  const sessions = [...sessionsByUuid.values()].map((session) =>
    toPublicAdminSession(cloneSession(session), currentSessionUuid),
  );

  return sessions.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}
