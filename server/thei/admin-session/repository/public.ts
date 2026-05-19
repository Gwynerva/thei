import type { H3Event } from 'h3';
import { inArray, not } from 'drizzle-orm';
import {
  cloneSession,
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
  const clonedMemorySessions = [...memorySessions.values()].map(cloneSession);

  const currentSessionUuid = event
    ? (await THEI_SERVER.getAdmin(event))?.sessionUuid
    : undefined;

  const { db, schema } = THEI_SERVER.useDb();
  const restDbSessions = await db
    .select()
    .from(schema.adminSessions)
    .where(
      not(
        inArray(
          schema.adminSessions.sessionUuid,
          clonedMemorySessions.map(
            (memorySession) => memorySession.sessionUuid,
          ),
        ),
      ),
    );

  const sessions = [
    ...clonedMemorySessions,
    ...restDbSessions.map((dbSession) => dbSession.data),
  ].map((session) => {
    return toPublicAdminSession(session, currentSessionUuid);
  });

  return sessions.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}
