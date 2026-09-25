import {
  expireAdminSessions,
  markAdminSessionsLoaded,
  memorySessions,
  loopAdminSessionSnapshotJob,
} from '.';

export async function bootAdminSessions() {
  const { db, schema } = THEI_SERVER.useDb();
  const sessions = await db.select().from(schema.adminSessions);
  const now = Date.now();

  await expireAdminSessions(
    sessions.map((row) => row.data),
    now,
  );

  for (const row of sessions) {
    const session = row.data;

    if (session.state !== 'active') {
      continue;
    }

    memorySessions.set(session.token, session);
  }

  markAdminSessionsLoaded();
  void loopAdminSessionSnapshotJob();

  if (memorySessions.size > 0) {
    THEI_SERVER.console.log(
      `Booted ${memorySessions.size} active admin session(s).`,
    );
  }
}
