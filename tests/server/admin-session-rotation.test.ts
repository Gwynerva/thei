import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createEvent } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminSessions } from '../../server/thei/db/schema/admin-sessions';
import {
  flushSessionsBeforeExit,
  flushSessionsToDb,
  getCurrentAdminSession,
  memorySessions,
  toSnapshotSessions,
  type AdminSessionData,
} from '../../server/thei/admin-session';
import { bootAdminSessions } from '../../server/thei/admin-session/boot';
import {
  previousTokenGrace,
  sessionDuration,
  tokenRotationInterval,
} from '../../server/thei/admin-session/const';

const start = Date.UTC(2026, 9, 20, 12);
const hour = 60 * 60 * 1000;
const cookieName = 'thei-admin-session-token';

let rawDb: Database.Database | undefined;
let failWrites = false;

beforeEach(() => {
  // Time moves only by `setSystemTime`: the 30 s snapshot never runs on its
  // own, so whatever reaches the database here was written on purpose.
  vi.useFakeTimers({
    now: start,
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
  });
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/' } }));
});

afterEach(() => {
  rawDb?.close();
  rawDb = undefined;
  failWrites = false;
  memorySessions.clear();
  toSnapshotSessions.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A site with one session whose token is a day old: the next use rotates it. */
async function bootSite() {
  rawDb = new Database(':memory:');
  rawDb.exec(
    'CREATE TABLE "admin-sessions" (sessionUuid TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)',
  );
  const schema = { adminSessions };
  const db = drizzle(rawDb, { schema });
  const logger = { log() {}, error() {} };
  vi.stubGlobal('THEI_SERVER', {
    useDb: () => {
      if (failWrites) throw new Error('The database is locked.');
      return { db, schema };
    },
    console: { ...logger, tag: () => logger },
  });
  const session: AdminSessionData = {
    sessionUuid: 'owner',
    state: 'active',
    createdAt: start - 2 * tokenRotationInterval,
    lastUsedAt: start - hour,
    expiresAt: start - hour + sessionDuration,
    meta: {},
    token: 'first-token',
    tokenCreatedAt: start - tokenRotationInterval - 1,
  };
  db.insert(adminSessions)
    .values({ sessionUuid: session.sessionUuid, data: session })
    .run();
  await bootAdminSessions();
}

/** The process ends without writing anything more, and boots again. */
async function restart() {
  memorySessions.clear();
  toSnapshotSessions.clear();
  await bootAdminSessions();
}

/**
 * An admin request carrying `token`: whose session it opened, and the token
 * the cookie of its response sets — '' when it clears the cookie.
 */
async function visit(token: string) {
  const request = new IncomingMessage(new Socket());
  request.url = '/api/admin/summary';
  request.headers.cookie = `${cookieName}=${token}`;
  const response = new ServerResponse(request);
  const session = await getCurrentAdminSession(createEvent(request, response));
  const header = response.getHeader('set-cookie');
  const cookies =
    header === undefined ? [] : Array.isArray(header) ? header : [`${header}`];
  const cookie = cookies
    .filter((line) => line.startsWith(`${cookieName}=`))
    .pop()
    ?.slice(cookieName.length + 1)
    .split(';')[0];
  return { sessionUuid: session?.sessionUuid, cookie };
}

function stored(): AdminSessionData {
  const row = rawDb!
    .prepare('SELECT data FROM "admin-sessions" WHERE sessionUuid = ?')
    .get('owner') as { data: string };
  return JSON.parse(row.data);
}

describe('a token rotation whose response never reaches the browser', () => {
  it('keeps the owner signed in with the old token and sends the new one again', async () => {
    await bootSite();
    const newToken = (await visit('first-token')).cookie!;
    expect(newToken).toMatch(/^[0-9a-f]{64}$/);

    // The browser kept the old token, long past the moment it used to stop
    // working.
    vi.setSystemTime(start + hour);
    expect(await visit('first-token')).toEqual({
      sessionUuid: 'owner',
      cookie: newToken,
    });
    vi.setSystemTime(start + 3 * tokenRotationInterval);
    expect(await visit('first-token')).toEqual({
      sessionUuid: 'owner',
      cookie: newToken,
    });
  });

  it('takes the old token only a few seconds more once the new one is seen', async () => {
    await bootSite();
    const newToken = (await visit('first-token')).cookie!;

    vi.setSystemTime(start + hour);
    expect(await visit(newToken)).toEqual({
      sessionUuid: 'owner',
      cookie: undefined,
    });

    // Requests the browser sent before the new cookie arrived still pass.
    vi.setSystemTime(start + hour + previousTokenGrace - 1);
    expect((await visit('first-token')).sessionUuid).toBe('owner');

    // After that the old token opens nothing, and a request held back that
    // long leaves the cookie alone: the browser holds the new token by now.
    vi.setSystemTime(start + hour + previousTokenGrace);
    expect(await visit('first-token')).toEqual({
      sessionUuid: undefined,
      cookie: undefined,
    });
    expect(memorySessions.has('first-token')).toBe(false);
    expect((await visit(newToken)).sessionUuid).toBe('owner');

    flushSessionsToDb();
    expect(stored().token).toBe(newToken);
    expect(stored().previousToken).toBeUndefined();
    expect(stored().previousTokenExpiresAt).toBeUndefined();
  });

  it('rotates again only once the previous token is gone', async () => {
    await bootSite();
    const second = (await visit('first-token')).cookie!;

    // A day on, the browser has still not got the second token: it is sent
    // again rather than replaced by a third.
    const later = start + tokenRotationInterval + 1;
    vi.setSystemTime(later);
    expect((await visit('first-token')).cookie).toBe(second);
    expect((await visit(second)).cookie).toBeUndefined();

    vi.setSystemTime(later + previousTokenGrace);
    const third = (await visit(second)).cookie!;
    expect(third).toMatch(/^[0-9a-f]{64}$/);
    expect(third).not.toBe(second);
    expect((await visit('first-token')).sessionUuid).toBeUndefined();
    expect((await visit(second)).cookie).toBe(third);
    expect(stored()).toMatchObject({ token: third, previousToken: second });
  });
});

describe('a rotated token across a restart', () => {
  it('is written at once, so a restart right after it keeps both tokens', async () => {
    await bootSite();
    const newToken = (await visit('first-token')).cookie!;
    expect(stored()).toMatchObject({
      token: newToken,
      previousToken: 'first-token',
      tokenCreatedAt: start,
    });

    await restart();
    vi.setSystemTime(start + hour);
    expect(await visit('first-token')).toEqual({
      sessionUuid: 'owner',
      cookie: newToken,
    });
    expect((await visit(newToken)).sessionUuid).toBe('owner');
  });

  it('keeps what the last seconds changed when the server stops', async () => {
    await bootSite();
    const newToken = (await visit('first-token')).cookie!;
    vi.setSystemTime(start + hour);
    await visit(newToken);

    flushSessionsBeforeExit();
    await restart();
    expect(stored()).toMatchObject({
      lastUsedAt: start + hour,
      previousTokenExpiresAt: start + hour + previousTokenGrace,
    });

    vi.setSystemTime(start + hour + previousTokenGrace);
    expect((await visit('first-token')).sessionUuid).toBeUndefined();
    expect((await visit(newToken)).sessionUuid).toBe('owner');
  });

  it('keeps a session a failed write could not store for the next write', async () => {
    await bootSite();
    failWrites = true;
    const newToken = (await visit('first-token')).cookie!;
    expect(newToken).toMatch(/^[0-9a-f]{64}$/);
    expect(stored().token).toBe('first-token');

    failWrites = false;
    flushSessionsToDb();
    expect(stored()).toMatchObject({
      token: newToken,
      previousToken: 'first-token',
    });
  });
});
