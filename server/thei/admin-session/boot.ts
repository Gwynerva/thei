import {
  expireAdminSessions,
  markAdminSessionsLoaded,
  loopAdminSessionSnapshotJob,
  rememberSessionInMemory,
} from '.';

export async function bootAdminSessions() {
  const { db, schema } = THEI_SERVER.useDb();
  const sessions = await db.select().from(schema.adminSessions);
  const now = Date.now();

  expireAdminSessions(
    sessions.map((row) => row.data),
    now,
  );

  let active = 0;
  for (const row of sessions) {
    const session = row.data;

    if (session.state !== 'active') {
      continue;
    }

    rememberSessionInMemory(session);
    active++;
  }

  markAdminSessionsLoaded();
  loopAdminSessionSnapshotJob();

  if (active > 0) {
    THEI_SERVER.console.log(`Booted ${active} active admin session(s).`);
  }
}
