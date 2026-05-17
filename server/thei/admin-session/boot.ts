import { memorySessions, loopAdminSessionSnapshotJob } from '.';

export async function bootAdminSessions() {
  const { db, schema } = THEI_SERVER.useDb();
  const sessions = await db.select().from(schema.adminSessions);
  const now = Date.now();

  for (const row of sessions) {
    const session = row.data;

    if (session.state !== 'active') {
      continue;
    }

    if (now >= session.expiresAt) {
      continue;
    }

    memorySessions.set(session.token, session);
  }

  loopAdminSessionSnapshotJob();

  THEI_SERVER.console.log(
    `Booted ${memorySessions.size} active admin session(s).`,
  );
}
