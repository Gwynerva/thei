import { eq } from 'drizzle-orm';
import { memorySessions, type AdminSessionData } from '.';
import { startSessionCleanupInterval } from './cleanup';

export async function bootAdminSessions() {
  const { db, schema } = THEI_SERVER.useDb();
  const dbSessions = await db
    .select()
    .from(schema.adminSessions)
    .where(eq(schema.adminSessions.destroyed, false));

  for (const dbSession of dbSessions) {
    const session: AdminSessionData = dbSession.sessionData;

    if (Date.now() >= session.sessionExpiresAt) {
      continue;
    }

    memorySessions.set(dbSession.token, session);
  }

  startSessionCleanupInterval();

  THEI_SERVER.console.log(
    `Booted ${memorySessions.size} active admin session(s).`,
  );
}
