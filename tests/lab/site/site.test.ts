// Snapshots and the playground, on folders made up for the test: whole
// restores, files shared by hard link (or copied across volumes), refusals
// where a database would be harmed, and sign-ins and access keys kept.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { LAB_CREDENTIALS } from './credentials';
import { mergedConfig, playgroundState, upPlayground } from './playground';
import {
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
  unknownMigrations,
} from './snapshot';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'thei-lab-site-'));
  made.push(dir);
  return dir;
}

function makeContent(
  dir: string,
  options: {
    config?: Record<string, unknown>;
    sessions?: [string, number][];
    /** Access keys, as [tokenUuid, tokenHash]. */
    keys?: [string, string][];
    marker?: string;
  } = {},
) {
  mkdirSync(join(dir, 'assets', 'ab'), { recursive: true });
  mkdirSync(join(dir, 'external-link-favicons'), { recursive: true });
  writeFileSync(
    join(dir, 'assets', 'ab', 'abcdef.jpg'),
    `picture ${options.marker ?? ''}`,
  );
  writeFileSync(join(dir, 'external-link-favicons', 'x.png'), 'icon');
  writeFileSync(
    join(dir, 'thei.config.json'),
    JSON.stringify(
      options.config ?? {
        version: '0.0.7',
        languageCode: 'ru',
        siteAccessLevel: 'public',
        secretPhrase: 'lab',
      },
    ),
  );
  const db = new Database(join(dir, 'thei.db'));
  db.exec(`
    CREATE TABLE _thei_migrations (id TEXT PRIMARY KEY, version TEXT, appliedAt INTEGER);
    CREATE TABLE assets (assetUuid TEXT PRIMARY KEY, touchedAt INTEGER);
    CREATE TABLE "admin-sessions" (sessionUuid TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE "api-tokens" (tokenUuid TEXT PRIMARY KEY, label TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE);
    CREATE TABLE "oauth-clients" (clientId TEXT PRIMARY KEY, kind TEXT NOT NULL);
    CREATE TABLE marker (value TEXT);
  `);
  for (const [tokenUuid, tokenHash] of options.keys ?? [])
    db.prepare('INSERT INTO "api-tokens" VALUES (?, ?, ?)').run(
      tokenUuid,
      'an app',
      tokenHash,
    );
  db.prepare('INSERT INTO _thei_migrations VALUES (?, ?, ?)').run(
    '0.0.1/001-baseline',
    '0.0.1',
    1,
  );
  db.prepare('INSERT INTO assets VALUES (?, ?)').run('a-1', 1);
  db.prepare('INSERT INTO marker VALUES (?)').run(options.marker ?? 'lab');
  for (const [id, lastUsedAt] of options.sessions ?? [])
    db.prepare('INSERT INTO "admin-sessions" VALUES (?, ?)').run(
      id,
      JSON.stringify({ sessionUuid: id, lastUsedAt }),
    );
  db.close();
}

function read(dir: string, sql: string) {
  const db = new Database(join(dir, 'thei.db'), { readonly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

describe('snapshots', () => {
  it('restore whole, the files shared with the cache', () => {
    const cache = tempDir();
    const content = join(tempDir(), 'content');
    makeContent(content);
    const manifest = saveSnapshot({ contentDir: content, cacheRoot: cache });
    expect(listSnapshots(cache).map((item) => item.id)).toEqual([manifest.id]);
    expect(manifest.ledger).toEqual(['0.0.1/001-baseline']);

    const target = join(tempDir(), 'content');
    restoreSnapshot({ manifest, contentDir: target, cacheRoot: cache });
    expect(
      readFileSync(join(target, 'assets', 'ab', 'abcdef.jpg'), 'utf8'),
    ).toBe('picture ');
    expect(
      statSync(join(target, 'assets', 'ab', 'abcdef.jpg')).nlink,
    ).toBeGreaterThan(1);
    expect(existsSync(join(target, 'external-link-favicons', 'x.png'))).toBe(
      true,
    );
    expect(read(target, 'SELECT value FROM marker')).toEqual([
      { value: 'lab' },
    ]);
    expect(
      (read(target, 'SELECT touchedAt FROM assets')[0] as { touchedAt: number })
        .touchedAt,
    ).toBeGreaterThan(1);
  });

  it('copy the files where a link cannot be made', () => {
    const cache = tempDir();
    const content = join(tempDir(), 'content');
    makeContent(content);
    const crossVolume = () => {
      throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    };
    const manifest = saveSnapshot({
      contentDir: content,
      cacheRoot: cache,
      link: crossVolume,
    });
    const target = join(tempDir(), 'content');
    const result = restoreSnapshot({
      manifest,
      contentDir: target,
      cacheRoot: cache,
      link: crossVolume,
    });
    expect(result.copied).toBe(1);
    expect(statSync(join(target, 'assets', 'ab', 'abcdef.jpg')).nlink).toBe(1);
  });

  it('refuse a site with a write that never finished', () => {
    const cache = tempDir();
    const content = join(tempDir(), 'content');
    makeContent(content);
    const manifest = saveSnapshot({ contentDir: content, cacheRoot: cache });
    writeFileSync(join(content, 'thei.db-journal'), 'half a write');
    expect(() =>
      restoreSnapshot({ manifest, contentDir: content, cacheRoot: cache }),
    ).toThrow(/thei\.db-journal/);
  });

  it('know which migrations a checkout lacks', () => {
    const manifest = {
      ledger: ['0.0.1/001-baseline', '9.9.9/001-future'],
    } as Parameters<typeof unknownMigrations>[0];
    expect(unknownMigrations(manifest, ['0.0.1/001-baseline'])).toEqual([
      '9.9.9/001-future',
    ]);
  });
});

describe('the playground', () => {
  it('keeps the playground’s own config keys and nothing else of it', () => {
    expect(
      mergedConfig(
        {
          version: '0.0.7',
          languageCode: 'ru',
          secretPhrase: 'lab',
          mcp: { enabled: false },
        },
        {
          version: '0.0.5',
          languageCode: 'en',
          secretPhrase: 'mine',
          password: { fallback: 'x' },
          mcp: { enabled: true },
        },
      ),
    ).toEqual({
      version: '0.0.7',
      languageCode: 'ru',
      secretPhrase: 'mine',
      password: { fallback: 'x' },
      mcp: { enabled: true },
    });
  });

  it('gives a playground with no config of its own the lab’s words', () => {
    expect(
      mergedConfig(
        {
          secretPhrase: LAB_CREDENTIALS.secretPhrase,
          password: { hash: 'h', salt: 's', iterations: 1 },
        },
        undefined,
      ),
    ).toEqual({
      secretPhrase: LAB_CREDENTIALS.secretPhrase,
      password: {
        hash: 'h',
        salt: 's',
        iterations: 1,
        fallback: LAB_CREDENTIALS.password,
      },
    });
  });

  it('takes the archive in place of what it held, sign-ins and keys kept', async () => {
    const cache = tempDir();
    const lab = join(tempDir(), 'content');
    makeContent(lab, { marker: 'lab', sessions: [['shared', 5]] });
    const manifest = saveSnapshot({ contentDir: lab, cacheRoot: cache });

    const site = tempDir();
    const content = join(site, 'content');
    const stateFile = join(tempDir(), 'playground.json');
    makeContent(content, {
      marker: 'mine',
      config: {
        version: '0.0.7',
        languageCode: 'en',
        secretPhrase: 'mine',
        password: { fallback: 'pw' },
      },
      sessions: [
        ['owner', 10],
        ['shared', 7],
      ],
      keys: [['key-1', 'hash-1']],
    });
    mkdirSync(join(site, '.thei'), { recursive: true });
    writeFileSync(join(site, '.thei', 'search.db'), 'my index');

    const up = () =>
      upPlayground({
        manifest,
        siteDir: site,
        stateFile,
        cacheRoot: cache,
        assumeStopped: true,
      });
    const result = await up();
    expect(result).toMatchObject({ sessions: 2, keys: 1, ownConfig: true });
    expect(read(content, 'SELECT value FROM marker')).toEqual([
      { value: 'lab' },
    ]);
    expect(
      JSON.parse(readFileSync(join(content, 'thei.config.json'), 'utf8')),
    ).toMatchObject({
      languageCode: 'ru',
      secretPhrase: 'mine',
      password: { fallback: 'pw' },
    });
    const sessions = () =>
      (
        read(
          content,
          'SELECT sessionUuid, data FROM "admin-sessions" ORDER BY sessionUuid',
        ) as { sessionUuid: string; data: string }[]
      ).map((row) => [row.sessionUuid, JSON.parse(row.data).lastUsedAt]);
    expect(sessions()).toEqual([
      ['owner', 10],
      ['shared', 7],
    ]);
    expect(
      read(content, 'SELECT tokenUuid, tokenHash FROM "api-tokens"'),
    ).toEqual([{ tokenUuid: 'key-1', tokenHash: 'hash-1' }]);
    expect(existsSync(join(site, '.thei', 'search.db'))).toBe(false);
    // What it held is gone, not kept beside it.
    expect(readdirSync(site).sort()).toEqual(['.thei', 'content']);
    expect(playgroundState(stateFile)?.snapshot).toBe(manifest.id);

    // A second `up` puts the archive back as it was seeded.
    const db = new Database(join(content, 'thei.db'));
    db.prepare('UPDATE marker SET value = ?').run('changed');
    db.close();
    await up();
    expect(read(content, 'SELECT value FROM marker')).toEqual([
      { value: 'lab' },
    ]);
    expect(sessions()).toEqual([
      ['owner', 10],
      ['shared', 7],
    ]);
  });

  it('fills an empty playground', async () => {
    const cache = tempDir();
    const lab = join(tempDir(), 'content');
    makeContent(lab, {
      marker: 'lab',
      config: {
        version: '0.0.7',
        languageCode: 'en',
        secretPhrase: LAB_CREDENTIALS.secretPhrase,
        password: { hash: 'h', salt: 's', iterations: 1 },
      },
    });
    const manifest = saveSnapshot({ contentDir: lab, cacheRoot: cache });
    const site = tempDir();
    const result = await upPlayground({
      manifest,
      siteDir: site,
      stateFile: join(tempDir(), 'playground.json'),
      cacheRoot: cache,
      assumeStopped: true,
    });
    expect(result.ownConfig).toBe(false);
    expect(
      JSON.parse(
        readFileSync(join(site, 'content', 'thei.config.json'), 'utf8'),
      ),
    ).toMatchObject({
      secretPhrase: LAB_CREDENTIALS.secretPhrase,
      password: { fallback: LAB_CREDENTIALS.password },
    });
    expect(read(join(site, 'content'), 'SELECT value FROM marker')).toEqual([
      { value: 'lab' },
    ]);
  });
});
