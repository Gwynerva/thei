import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createEvent } from 'h3';
import sessionTokenHashes from '../../update/migrations/0.0.7-session-token-hashes';
import { hashSessionToken } from '../../server/thei/admin-session/token';
import {
  isClosedSiteAdmin,
  rememberClosedSiteAdmins,
} from '../../server/thei/admin-session/closed-site';
import { schema_0_0_6 } from './fixtures/schema-0.0.6';

/**
 * A 0.0.6 site kept each admin session's token itself in the database, and
 * so in every backup. From 0.0.7 a row keeps only its hash; the cookie of
 * the browser that signed in still carries the token, and opens it.
 */

let rawDb: Database.Database;
const now = Date.UTC(2026, 9, 20, 12);

beforeEach(() => {
  vi.useFakeTimers({ now, toFake: ['Date'] });
  vi.stubGlobal('useRuntimeConfig', () => ({ app: { baseURL: '/' } }));
  rawDb = new Database(':memory:');
  for (const statement of schema_0_0_6) rawDb.prepare(statement).run();
});

afterEach(() => {
  rawDb.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function insert(sessionUuid: string, data: Record<string, unknown>) {
  rawDb
    .prepare('INSERT INTO `admin-sessions` (sessionUuid, data) VALUES (?, ?)')
    .run(sessionUuid, JSON.stringify({ sessionUuid, ...data }));
}

function stored(sessionUuid: string) {
  const row = rawDb
    .prepare('SELECT data FROM `admin-sessions` WHERE sessionUuid = ?')
    .get(sessionUuid) as { data: string };
  return JSON.parse(row.data);
}

function migrate() {
  sessionTokenHashes.up!({ rawDb, log: () => {} } as never);
}

function withToken(token: string) {
  const request = new IncomingMessage(new Socket());
  request.headers.cookie = `thei-admin-session-token=${token}`;
  return createEvent(request, new ServerResponse(request));
}

const session = {
  state: 'active',
  createdAt: now - 1000,
  lastUsedAt: now - 500,
  expiresAt: now + 60_000,
  meta: { browser: 'Firefox' },
  tokenCreatedAt: now - 1000,
};

describe('admin sessions keep only the hashes of their tokens', () => {
  it('turns a 0.0.6 row into the hashed shape, and changes nothing the second time', () => {
    insert('owner', { ...session, token: 'raw-token' });
    insert('ended', { ...session, state: 'destroyed', token: 'ended-token' });
    migrate();

    const owner = stored('owner');
    expect(owner).toEqual({
      sessionUuid: 'owner',
      ...session,
      tokenHash: hashSessionToken('raw-token'),
    });
    expect(owner.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored('ended')).not.toHaveProperty('token');
    expect(JSON.stringify(stored('ended'))).not.toContain('ended-token');

    const before = rawDb.prepare('SELECT * FROM `admin-sessions`').all();
    migrate();
    expect(rawDb.prepare('SELECT * FROM `admin-sessions`').all()).toEqual(
      before,
    );
  });

  it('keeps a previous token whose replacement was seen, and lets go of one whose replacement never was', () => {
    insert('seen', {
      ...session,
      token: 'seen-token',
      previousToken: 'seen-old-token',
      previousTokenExpiresAt: now + 5000,
    });
    insert('unseen', {
      ...session,
      token: 'unseen-token',
      previousToken: 'unseen-old-token',
    });
    migrate();

    expect(stored('seen')).toMatchObject({
      tokenHash: hashSessionToken('seen-token'),
      previousTokenHash: hashSessionToken('seen-old-token'),
      previousTokenExpiresAt: now + 5000,
    });
    expect(stored('seen')).not.toHaveProperty('previousToken');
    const unseen = stored('unseen');
    expect(unseen.tokenHash).toBe(hashSessionToken('unseen-token'));
    expect(unseen).not.toHaveProperty('previousToken');
    expect(unseen).not.toHaveProperty('previousTokenHash');
  });

  it('leaves the closed site recognising its admin by the cookie, before the migration and after it', () => {
    insert('owner', {
      ...session,
      token: 'raw-token',
      previousToken: 'old-token',
      previousTokenExpiresAt: now + 5000,
    });
    rememberClosedSiteAdmins(rawDb);
    expect(isClosedSiteAdmin(withToken('raw-token'))).toBe(true);
    expect(isClosedSiteAdmin(withToken('old-token'))).toBe(true);
    expect(isClosedSiteAdmin(withToken(hashSessionToken('raw-token')))).toBe(
      false,
    );

    migrate();
    rememberClosedSiteAdmins(rawDb);
    expect(isClosedSiteAdmin(withToken('raw-token'))).toBe(true);
    expect(isClosedSiteAdmin(withToken('old-token'))).toBe(true);
    expect(isClosedSiteAdmin(withToken(hashSessionToken('raw-token')))).toBe(
      false,
    );

    // The previous token is taken only through its grace, though the
    // session goes on.
    vi.setSystemTime(now + 5000);
    expect(isClosedSiteAdmin(withToken('old-token'))).toBe(false);
    expect(isClosedSiteAdmin(withToken('raw-token'))).toBe(true);
  });
});
