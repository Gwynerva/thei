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
  rememberSessionInMemory,
  toSnapshotSessions,
  type AdminSessionData,
} from '../../server/thei/admin-session';
import {
  isClosedSiteAdmin,
  rememberClosedSiteAdmins,
} from '../../server/thei/admin-session/closed-site';
import { getPublicAdminSessions } from '../../server/thei/admin-session/repository/public';
import { hashSessionToken } from '../../server/thei/admin-session/token';

let rawDb: Database.Database | undefined;

afterEach(() => {
  rawDb?.close();
  rawDb = undefined;
  memorySessions.clear();
  toSnapshotSessions.clear();
  vi.useRealTimers();
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
    tokenHash: hashSessionToken(`${sessionUuid}-token`),
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

  it('are recognised by a closed site by a token whose replacement never arrived', () => {
    createDb();
    const now = Date.now();
    const missed = {
      ...session('missed', 'active', now + 60_000),
      previousTokenHash: hashSessionToken('missed-old-token'),
    };
    const seen = {
      ...session('seen', 'active', now + 60_000),
      previousTokenHash: hashSessionToken('seen-old-token'),
      previousTokenExpiresAt: now - 1,
    };
    const insert = rawDb!.prepare(
      'INSERT INTO "admin-sessions" (sessionUuid, data) VALUES (?, ?)',
    );
    for (const row of [missed, seen])
      insert.run(row.sessionUuid, JSON.stringify(row));
    rememberClosedSiteAdmins(rawDb!);

    const withToken = (token: string) => {
      const request = new IncomingMessage(new Socket());
      request.headers.cookie = `thei-admin-session-token=${token}`;
      return createEvent(request, new ServerResponse(request));
    };
    expect(isClosedSiteAdmin(withToken('missed-token'))).toBe(true);
    expect(isClosedSiteAdmin(withToken('missed-old-token'))).toBe(true);
    expect(isClosedSiteAdmin(withToken('seen-token'))).toBe(true);
    expect(isClosedSiteAdmin(withToken('seen-old-token'))).toBe(false);
  });

  it('take the token a rotation replaced only through its grace, though the session goes on', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    createDb();
    const now = Date.now();
    const graced = {
      ...session('graced', 'active', now + 60_000),
      previousTokenHash: hashSessionToken('graced-old-token'),
      previousTokenExpiresAt: now + 3000,
    };
    rawDb!
      .prepare('INSERT INTO "admin-sessions" (sessionUuid, data) VALUES (?, ?)')
      .run(graced.sessionUuid, JSON.stringify(graced));
    rememberClosedSiteAdmins(rawDb!);

    const withToken = (token: string) => {
      const request = new IncomingMessage(new Socket());
      request.headers.cookie = `thei-admin-session-token=${token}`;
      return createEvent(request, new ServerResponse(request));
    };
    expect(isClosedSiteAdmin(withToken('graced-old-token'))).toBe(true);
    vi.setSystemTime(now + 3000);
    expect(isClosedSiteAdmin(withToken('graced-old-token'))).toBe(false);
    expect(isClosedSiteAdmin(withToken('graced-token'))).toBe(true);
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
    expiredMemory.previousTokenHash = hashSessionToken('old-expired-token');
    rememberSessionInMemory(expiredMemory);
    rememberSessionInMemory(active);

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
    expect(memorySessions.has(expiredMemory.tokenHash)).toBe(false);
    expect(memorySessions.has(active.tokenHash)).toBe(true);
    expect(memorySessions.has(hashSessionToken('old-expired-token'))).toBe(
      false,
    );
    expect(
      db
        .select()
        .from(adminSessions)
        .all()
        .find((row) => row.sessionUuid === 'expired-db')?.data,
    ).toMatchObject({ state: 'destroyed', lastUsedAt: 200 });
  });

  it('revokes other sessions and their previous tokens while preserving the current one', async () => {
    const db = createDb();
    const current = session('current', 'active', Date.now() + 60_000);
    const other = session('other', 'active', Date.now() + 60_000);
    db.insert(adminSessions)
      .values([
        { sessionUuid: current.sessionUuid, data: current },
        { sessionUuid: other.sessionUuid, data: other },
      ])
      .run();
    other.previousTokenHash = hashSessionToken('old-other-token');
    rememberSessionInMemory(current);
    rememberSessionInMemory(other);

    expect(destroyOtherAdminSessions(current.sessionUuid)).toBe(true);
    expect(memorySessions.get(current.tokenHash)).toBe(current);
    expect(memorySessions.has(other.tokenHash)).toBe(false);
    expect(memorySessions.has(hashSessionToken('old-other-token'))).toBe(false);
    expect(
      db
        .select()
        .from(adminSessions)
        .all()
        .find((row) => row.sessionUuid === other.sessionUuid)?.data,
    ).toMatchObject({ state: 'destroyed' });
  });
});
