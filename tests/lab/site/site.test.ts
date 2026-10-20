// Snapshots and the playground swap, on folders made up for the test: whole
// restores, files shared by hard link (or copied across volumes), refusals
// where a database would be harmed, and sign-ins kept both ways.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  downPlayground,
  mergedConfig,
  stashPaths,
  upPlayground,
} from './playground';
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
    CREATE TABLE marker (value TEXT);
  `);
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

describe('the playground swap', () => {
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

  it('goes up and down, sign-ins kept both ways', async () => {
    const cache = tempDir();
    const lab = join(tempDir(), 'content');
    makeContent(lab, { marker: 'lab', sessions: [['shared', 5]] });
    const manifest = saveSnapshot({ contentDir: lab, cacheRoot: cache });

    const site = tempDir();
    const stashRoot = join(tempDir(), 'stash');
    makeContent(join(site, 'content'), {
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
    });
    mkdirSync(join(site, '.thei'), { recursive: true });
    writeFileSync(join(site, '.thei', 'search.db'), 'my index');

    await upPlayground({
      manifest,
      siteDir: site,
      stashRoot,
      cacheRoot: cache,
      assumeStopped: true,
    });
    expect(read(join(site, 'content'), 'SELECT value FROM marker')).toEqual([
      { value: 'lab' },
    ]);
    const config = JSON.parse(
      readFileSync(join(site, 'content', 'thei.config.json'), 'utf8'),
    );
    expect(config).toMatchObject({
      languageCode: 'ru',
      secretPhrase: 'mine',
      password: { fallback: 'pw' },
    });
    const sessions = read(
      join(site, 'content'),
      'SELECT sessionUuid, data FROM "admin-sessions" ORDER BY sessionUuid',
    ) as { sessionUuid: string; data: string }[];
    expect(
      sessions.map((row) => [row.sessionUuid, JSON.parse(row.data).lastUsedAt]),
    ).toEqual([
      ['owner', 10],
      ['shared', 7],
    ]);
    expect(existsSync(join(site, '.thei', 'search.db'))).toBe(false);
    await expect(
      upPlayground({
        manifest,
        siteDir: site,
        stashRoot,
        cacheRoot: cache,
        assumeStopped: true,
      }),
    ).rejects.toThrow(/already stands in/);

    // A sign-in made while the archive stood in goes back with the playground.
    const db = new Database(join(site, 'content', 'thei.db'));
    db.prepare('INSERT INTO "admin-sessions" VALUES (?, ?)').run(
      'new',
      JSON.stringify({ lastUsedAt: 20 }),
    );
    db.close();
    await downPlayground({ siteDir: site, stashRoot, assumeStopped: true });
    expect(read(join(site, 'content'), 'SELECT value FROM marker')).toEqual([
      { value: 'mine' },
    ]);
    expect(
      (
        read(
          join(site, 'content'),
          'SELECT sessionUuid FROM "admin-sessions" ORDER BY sessionUuid',
        ) as { sessionUuid: string }[]
      ).map((row) => row.sessionUuid),
    ).toEqual(['new', 'owner', 'shared']);
    expect(readFileSync(join(site, '.thei', 'search.db'), 'utf8')).toBe(
      'my index',
    );
    expect(existsSync(stashPaths(stashRoot).dir)).toBe(false);
  });
});
