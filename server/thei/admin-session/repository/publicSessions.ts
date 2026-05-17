import type { H3Event } from 'h3';
import { sql } from 'drizzle-orm';
import type { RequestLocation, RequestUserAgent } from '../../request';
import { memorySessions } from '..';
import { getTokenCookie } from '../token';

export interface PublicAdminSession {
  sessionUuid: string;
  current: boolean;
  destroyed: boolean;
  createdAt: number;
  lastUsedAt: number;
  location: RequestLocation;
  userAgent: RequestUserAgent;
}

export async function getPublicAdminSessions(
  event?: H3Event,
): Promise<PublicAdminSession[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const dbSessions = await db
    .select()
    .from(schema.adminSessions)
    .orderBy(
      sql`json_extract(${schema.adminSessions.sessionData}, '$.lastUsedAt') DESC`,
    );

  const currentToken = event ? getTokenCookie(event) : undefined;
  const currentSessionUuid = memorySessions.get(
    currentToken || '',
  )?.sessionUuid;

  return dbSessions.map((dbSession) => {
    const jsonSession = dbSession.sessionData;
    return {
      sessionUuid: dbSession.sessionUuid,
      current: dbSession.sessionUuid === currentSessionUuid,
      destroyed: dbSession.destroyed,
      createdAt: jsonSession.createdAt,
      lastUsedAt: jsonSession.lastUsedAt,
      location: jsonSession.location,
      userAgent: jsonSession.userAgent,
    };
  });
}
