import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminSessions } from '../../server/thei/db/schema/admin-sessions';
import {
  destroyOtherAdminSessions,
  memorySessions,
  toSnapshotSessions,
  type AdminSessionData,
} from '../../server/thei/admin-session';
import { tokenAliases } from '../../server/thei/admin-session/token';
import { getPublicAdminSessions } from '../../server/thei/admin-session/repository/public';

let rawDb: Database.Database | undefined;

afterEach(() => {
  rawDb?.close();
  rawDb = undefined;
  memorySessions.clear();
  toSnapshotSessions.clear();
  tokenAliases.clear();
  vi.unstubAllGlobals();
});

function session(
  sessionUuid: string,
  state: AdminSessionData['state'],
  expiresAt: number,
): AdminSessionData {
  return {
    sessionUuid,
    state,
    createdAt: 100,
    lastUsedAt: 200,
    expiresAt,
    meta: {},
    token: `${sessionUuid}-token`,
    tokenCreatedAt: 100,
  };
}

function createDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(
    'CREATE TABLE "admin-sessions" (sessionUuid TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)',
  );
  const schema = { adminSessions };
  const db = drizzle(rawDb, { schema });
  vi.stubGlobal('THEI_SERVER', { useDb: () => ({ db, schema }) });
  return db;
}

describe('admin session expiration', () => {
  it('persists expired database and memory sessions without changing last use', async () => {
    const db = createDb();
    const now = Date.now();
    const expiredDb = session('expired-db', 'active', now - 1);
    const expiredMemory = session('expired-memory', 'active', now - 1);
    const active = session('active', 'active', now + 60_000);
    const destroyed = session('destroyed', 'destroyed', now - 1);
    db.insert(adminSessions)
      .values([
        { sessionUuid: expiredDb.sessionUuid, data: expiredDb },
        { sessionUuid: destroyed.sessionUuid, data: destroyed },
      ])
      .run();
    memorySessions.set(expiredMemory.token, expiredMemory);
    memorySessions.set(active.token, active);
    tokenAliases.set('old-expired-token', {
      token: expiredMemory.token,
      expiresAt: now + 10_000,
    });

    const result = await getPublicAdminSessions();

    expect(
      result.find((item) => item.sessionUuid === 'expired-db'),
    ).toMatchObject({
      state: 'destroyed',
      lastUsedAt: 200,
    });
    expect(
      result.find((item) => item.sessionUuid === 'expired-memory'),
    ).toMatchObject({
      state: 'destroyed',
      lastUsedAt: 200,
    });
    expect(result.find((item) => item.sessionUuid === 'active')?.state).toBe(
      'active',
    );
    expect(result.find((item) => item.sessionUuid === 'destroyed')?.state).toBe(
      'destroyed',
    );
    expect(memorySessions.has(expiredMemory.token)).toBe(false);
    expect(memorySessions.has(active.token)).toBe(true);
    expect(tokenAliases.has('old-expired-token')).toBe(false);
    expect(
      db
        .select()
        .from(adminSessions)
        .all()
        .find((row) => row.sessionUuid === 'expired-db')?.data,
    ).toMatchObject({ state: 'destroyed', lastUsedAt: 200 });
  });

  it('revokes other sessions and token aliases while preserving the current one', async () => {
    const db = createDb();
    const current = session('current', 'active', Date.now() + 60_000);
    const other = session('other', 'active', Date.now() + 60_000);
    db.insert(adminSessions)
      .values([
        { sessionUuid: current.sessionUuid, data: current },
        { sessionUuid: other.sessionUuid, data: other },
      ])
      .run();
    memorySessions.set(current.token, current);
    memorySessions.set(other.token, other);
    tokenAliases.set('old-other-token', {
      token: other.token,
      expiresAt: Date.now() + 60_000,
    });

    expect(await destroyOtherAdminSessions(current.sessionUuid)).toBe(true);
    expect(memorySessions.get(current.token)).toBe(current);
    expect(memorySessions.has(other.token)).toBe(false);
    expect(tokenAliases.has('old-other-token')).toBe(false);
    expect(
      db
        .select()
        .from(adminSessions)
        .all()
        .find((row) => row.sessionUuid === other.sessionUuid)?.data,
    ).toMatchObject({ state: 'destroyed' });
  });
});
