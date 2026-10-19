import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import { baselineSql } from '../../update/migrations';
import { fingerprintOf } from '../../server/thei/ai/actions/declined';
import { refreshIdentityKeys } from '../../server/thei/identity-keys';
import { termKey } from '../../shared/identity-key';

let rawDb: Database.Database;
let logged: string[];

beforeEach(() => {
  rawDb = new Database(':memory:');
  for (const statement of baselineSql) rawDb.prepare(statement).run();
  const db = drizzle(rawDb, { schema });
  Object.assign(globalThis, {
    THEI_SERVER: { useDb: () => ({ db, schema, rawDb }) },
  });
  logged = [];
});

afterEach(() => {
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
});

function tag(tagUuid: string, title: string, normalizedTitle: string) {
  rawDb
    .prepare(
      'INSERT INTO tags (tagUuid, title, normalizedTitle, slug, publicId) VALUES (?, ?, ?, ?, ?)',
    )
    .run(tagUuid, title, normalizedTitle, tagUuid, tagUuid);
}

function term(word: string, display: string) {
  rawDb
    .prepare(
      'INSERT INTO "ai-terms" (word, display, note, forms, keep, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(word, display, '', '[]', 0, 1, 1);
}

const run = () =>
  refreshIdentityKeys(
    () => {},
    (message) => logged.push(message),
  );

const tagKey = (tagUuid: string) =>
  (
    rawDb
      .prepare('SELECT normalizedTitle FROM tags WHERE tagUuid = ?')
      .get(tagUuid) as { normalizedTitle: string }
  ).normalizedTitle;

describe('the identity keys task', () => {
  it('counts the keys again, as a Turkish locale left them', async () => {
    // A Turkish server lower-cased «I» to «ı».
    tag('t-1', 'Istanbul', 'ıstanbul');
    tag('t-2', 'Косплей', 'косплей');
    term('ınk', 'Ink');
    const result = await run();
    expect(tagKey('t-1')).toBe('istanbul');
    expect(tagKey('t-2')).toBe('косплей');
    expect(rawDb.prepare('SELECT word FROM "ai-terms"').pluck().all()).toEqual([
      'ink',
    ]);
    expect(result).toEqual({ changed: 2, skipped: 0 });
    // Again: nothing left to do.
    expect(await run()).toEqual({ changed: 0, skipped: 0 });
  });

  it('never merges: a key another row has is left and said', async () => {
    tag('t-1', 'Istanbul', 'ıstanbul');
    tag('t-2', 'istanbul', 'istanbul');
    term('ınk', 'Ink');
    term('ink', 'ink');
    const result = await run();
    expect(tagKey('t-1')).toBe('ıstanbul');
    expect(result).toEqual({ changed: 0, skipped: 2 });
    expect(logged.join('\n')).toContain('Istanbul');
    expect(logged.join('\n')).toContain('Ink');
  });

  it('moves a declined word’s fingerprint, and the record that keeps it', async () => {
    // Made on a Turkish server, where «Ink» was keyed «ınk».
    const old = fingerprintOf(['term', null, ['ınk']]);
    rawDb
      .prepare(
        `INSERT INTO "ai-actions" (actionUuid, sessionUuid, kind, payload, certainty, state, fingerprint, createdAt)
         VALUES ('a-1', 's-1', 'term', ?, 'sure', 'declined', ?, 1)`,
      )
      .run(
        JSON.stringify({ kind: 'term', word: 'Ink', note: '', forms: [] }),
        old,
      );
    rawDb
      .prepare(
        `INSERT INTO "ai-memory" (memoryUuid, anchor, type, text, fingerprint, createdAt, updatedAt)
         VALUES ('m-1', 'owner', 'never', 'Ink', ?, 1, 1)`,
      )
      .run(old);
    const turkish = (value: string) => value.toLocaleLowerCase('tr');
    await refreshIdentityKeys(
      () => {},
      () => {},
      turkish,
    );
    const made = fingerprintOf(['term', null, [termKey('Ink')]]);
    const read = (sql: string) => rawDb.prepare(sql).pluck().get();
    expect(
      read(`SELECT fingerprint FROM "ai-actions" WHERE actionUuid = 'a-1'`),
    ).toBe(made);
    expect(
      read(`SELECT fingerprint FROM "ai-memory" WHERE memoryUuid = 'm-1'`),
    ).toBe(made);
    // Again: nothing to move.
    await refreshIdentityKeys(
      () => {},
      () => {},
      turkish,
    );
    expect(
      read(`SELECT fingerprint FROM "ai-actions" WHERE actionUuid = 'a-1'`),
    ).toBe(made);
  });

  it('leaves a fingerprint it cannot tell the words of', async () => {
    rawDb
      .prepare(
        `INSERT INTO "ai-actions" (actionUuid, sessionUuid, kind, payload, certainty, state, fingerprint, createdAt)
         VALUES ('a-1', 's-1', 'term', '{"word":"Ink"}', 'sure', 'declined', 'other', 1)`,
      )
      .run();
    await run();
    expect(
      rawDb.prepare(`SELECT fingerprint FROM "ai-actions"`).pluck().get(),
    ).toBe('other');
  });
});
