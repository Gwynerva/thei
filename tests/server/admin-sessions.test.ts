import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createEvent } from 'h3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminSessions } from '../../server/thei/db/schema/admin-sessions';
import {
  destroyOtherAdminSessions,
  getCurrentAdminSession,
  memorySessions,
  toSnapshotSessions,
  type AdminSessionData,
} from '../../server/thei/admin-session';
import {
  isClosedSiteAdmin,
  rememberClosedSiteAdmins,
} from '../../server/thei/admin-session/closed-site';
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

describe('admin sessions before they are loaded', () => {
  it('recognise nobody and leave the session cookie alone', async () => {
    // While the site is closed for an update the sessions are still in the
    // database. A cookie seen then is not a stale one.
    const request = new IncomingMessage(new Socket());
    request.headers.cookie = 'thei-admin-session-token=some-token';
    const response = new ServerResponse(request);
    const event = createEvent(request, response);

    expect(await getCurrentAdminSession(event)).toBeUndefined();
    expect(response.getHeader('set-cookie')).toBeUndefined();
  });

  it('are recognised by a closed site from the table as it stood before the migrations', () => {
    createDb();
    const now = Date.now();
    const rows = [
      session('active', 'active', now + 60_000),
      session('expired', 'active', now - 1),
      session('destroyed', 'destroyed', now + 60_000),
    ];
    const insert = rawDb!.prepare(
      'INSERT INTO "admin-sessions" (sessionUuid, data) VALUES (?, ?)',
    );
    for (const row of rows) insert.run(row.sessionUuid, JSON.stringify(row));
    insert.run('broken', '{not json');
    rememberClosedSiteAdmins(rawDb!);

    const withToken = (token?: string) => {
      const request = new IncomingMessage(new Socket());
      if (token) request.headers.cookie = `thei-admin-session-token=${token}`;
      return createEvent(request, new ServerResponse(request));
    };
    expect(isClosedSiteAdmin(withToken('active-token'))).toBe(true);
    expect(isClosedSiteAdmin(withToken('expired-token'))).toBe(false);
    expect(isClosedSiteAdmin(withToken('destroyed-token'))).toBe(false);
    expect(isClosedSiteAdmin(withToken())).toBe(false);
  });

  it('recognise nobody early when the table cannot be read', () => {
    const empty = new Database(':memory:');
    rememberClosedSiteAdmins(empty);
    empty.close();
    const request = new IncomingMessage(new Socket());
    request.headers.cookie = 'thei-admin-session-token=active-token';
    expect(
      isClosedSiteAdmin(createEvent(request, new ServerResponse(request))),
    ).toBe(false);
  });
});

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
