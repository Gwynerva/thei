import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MigrationError,
  openLedger,
  runPendingMigrations,
  seedLedger,
  type MigrationProgressEvent,
} from '../../update/migrations/run';
import {
  hasLedger,
  readLedger,
  recordMigration,
  taskLedgerId,
} from '../../update/migrations/ledger';
import {
  defineMigration,
  type MigrationContext,
} from '../../update/migrations/types';

const baseline = defineMigration({
  id: '0.0.1/001-baseline',
  version: '0.0.1',
  title: 'baseline',
  up({ rawDb }) {
    rawDb.prepare('CREATE TABLE notes (id TEXT PRIMARY KEY)').run();
  },
});

const addColor = defineMigration({
  id: '0.2.0/001-add-color',
  version: '0.2.0',
  title: { en: 'add color', ru: 'добавить цвет' },
  up({ rawDb }) {
    rawDb.prepare('ALTER TABLE notes ADD COLUMN color TEXT').run();
  },
});

const broken = defineMigration({
  id: '0.3.0/001-broken',
  version: '0.3.0',
  title: 'broken',
  up({ rawDb }) {
    rawDb.prepare('ALTER TABLE notes ADD COLUMN size TEXT').run();
    rawDb.prepare('THIS IS NOT SQL').run();
  },
});

let directory: string;
let rawDb: Database.Database;

const options = (
  installedVersion: string,
  registry = [baseline, addColor],
) => ({
  installedVersion,
  contentPath: (...parts: string[]) => join(directory, ...parts),
  registry,
});

const context = (): MigrationContext => ({
  rawDb,
  contentPath: () => '',
  readConfig: async () => ({}),
  writeConfig: async () => {},
  log: () => {},
});

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-migrations-'));
  rawDb = new Database(join(directory, 'test.db'));
});

afterEach(async () => {
  rawDb.close();
  await rm(directory, { recursive: true, force: true });
});

describe('migration runner', () => {
  it('applies pending migrations in order and records them', async () => {
    const result = await runPendingMigrations(rawDb, options('0.0.0'));

    expect(result.applied.map((migration) => migration.id)).toEqual([
      '0.0.1/001-baseline',
      '0.2.0/001-add-color',
    ]);
    expect(
      readLedger(rawDb)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(['0.0.1/001-baseline', '0.2.0/001-add-color']);
  });

  it('is a no-op on the second run', async () => {
    await runPendingMigrations(rawDb, options('0.0.0'));
    const second = await runPendingMigrations(rawDb, options('0.0.0'));

    expect(second.applied).toEqual([]);
  });

  it('adopts a ledger-less database at its recorded version', async () => {
    // A database created by an older Thei: the baseline schema is already
    // there, but nothing has ever been recorded.
    baseline.up(context());
    expect(hasLedger(rawDb)).toBe(false);

    const result = await runPendingMigrations(rawDb, options('0.0.1'));

    expect(result.adopted).toBe(1);
    expect(result.applied.map((migration) => migration.id)).toEqual([
      '0.2.0/001-add-color',
    ]);
  });

  it('rolls back a failing migration and records nothing for it', async () => {
    const result = await runPendingMigrations(rawDb, options('0.0.0'));
    expect(result.applied).toHaveLength(2);

    await expect(
      runPendingMigrations(
        rawDb,
        options('0.0.0', [baseline, addColor, broken]),
      ),
    ).rejects.toThrow(MigrationError);

    const columns = rawDb
      .pragma("table_info('notes')")
      .map((column: any) => column.name);
    expect(columns).not.toContain('size');
    expect(readLedger(rawDb).map((entry) => entry.id)).not.toContain(
      '0.3.0/001-broken',
    );
  });

  it('reports the failing migration id', async () => {
    const error = await runPendingMigrations(
      rawDb,
      options('0.0.0', [baseline, broken]),
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(MigrationError);
    expect((error as MigrationError).reason).toBe('migration-failed');
    expect((error as MigrationError).migrationId).toBe('0.3.0/001-broken');
  });

  it('refuses to open content written by a newer Thei', async () => {
    await runPendingMigrations(rawDb, options('0.0.0', [baseline, addColor]));

    // The engine was downgraded: it no longer knows about 0.2.0.
    const error = await runPendingMigrations(
      rawDb,
      options('0.0.0', [baseline]),
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(MigrationError);
    expect((error as MigrationError).reason).toBe('downgrade');
    expect((error as MigrationError).message).toContain('0.2.0');
  });

  it('replaces a ledger table left in an older, incompatible shape', async () => {
    baseline.up(context());
    // The shape an earlier, abandoned migration system used.
    rawDb
      .prepare(
        `CREATE TABLE "_thei_migrations" (
          "id" text PRIMARY KEY NOT NULL,
          "checksum" text NOT NULL,
          "targetVersion" text NOT NULL,
          "completedAt" integer NOT NULL
        )`,
      )
      .run();
    rawDb
      .prepare('INSERT INTO _thei_migrations VALUES (?, ?, ?, ?)')
      .run('0.0.1/000-baseline', 'abc', '0.0.1', Date.now());

    const result = await runPendingMigrations(rawDb, options('0.0.1'));

    expect(result.adopted).toBe(1);
    expect(result.applied.map((migration) => migration.id)).toEqual([
      '0.2.0/001-add-color',
    ]);
    expect(
      readLedger(rawDb)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(['0.0.1/001-baseline', '0.2.0/001-add-color']);
  });

  it('seeds every migration for a database built from the baseline', async () => {
    seedLedger(rawDb, [baseline, addColor]);

    const result = await runPendingMigrations(rawDb, options('0.2.0'));
    expect(result.applied).toEqual([]);
    expect(result.adopted).toBe(0);
  });

  it('reports progress for every pending migration', async () => {
    const events: string[] = [];
    await runPendingMigrations(rawDb, {
      ...options('0.0.0', [baseline, addColor, broken]),
      onProgress: (event: MigrationProgressEvent) => {
        events.push(`${event.type}:${event.migration.id}`);
      },
    }).catch(() => {});

    expect(events).toEqual([
      'start:0.0.1/001-baseline',
      'done:0.0.1/001-baseline',
      'start:0.2.0/001-add-color',
      'done:0.2.0/001-add-color',
      'start:0.3.0/001-broken',
      'fail:0.3.0/001-broken',
    ]);
  });
});

describe('update tasks in the ledger', () => {
  const previews = { id: '0.2.0/001-previews', version: '0.2.0' };
  const colors = { id: '0.3.0/001-colors', version: '0.3.0' };

  it('lists the tasks the ledger has not recorded, in registry order', async () => {
    await runPendingMigrations(rawDb, options('0.0.0'));

    const ledger = openLedger(rawDb, {
      ...options('0.0.0'),
      tasks: [previews, colors],
    });
    expect(ledger.pendingMigrations).toEqual([]);
    expect(ledger.pendingTasks).toEqual([previews, colors]);

    recordMigration(rawDb, taskLedgerId(previews.id), previews.version);
    expect(
      openLedger(rawDb, { ...options('0.0.0'), tasks: [previews, colors] })
        .pendingTasks,
    ).toEqual([colors]);
  });

  it('adopts the tasks a ledger-less database already went through', () => {
    baseline.up(context());

    const ledger = openLedger(rawDb, {
      ...options('0.2.0'),
      tasks: [previews, colors],
    });

    expect(ledger.adopted).toBe(3);
    expect(ledger.pendingTasks).toEqual([colors]);
    expect(readLedger(rawDb).map((entry) => entry.id)).toContain(
      'task:0.2.0/001-previews',
    );
  });

  it('seeds the tasks of a database built from the baseline', () => {
    seedLedger(rawDb, [baseline, addColor], [previews]);

    const ledger = openLedger(rawDb, {
      ...options('0.2.0'),
      tasks: [previews],
    });
    expect(ledger.pendingMigrations).toEqual([]);
    expect(ledger.pendingTasks).toEqual([]);
  });

  it('counts a recorded task as the content version', () => {
    seedLedger(rawDb, [baseline, addColor], [previews, colors]);

    // A release that shipped only a task still opens its own content...
    expect(() =>
      openLedger(rawDb, { ...options('0.0.0'), tasks: [previews, colors] }),
    ).not.toThrow();

    // ...and an engine that knows nothing of it refuses it as a downgrade.
    const error = (() => {
      try {
        openLedger(rawDb, { ...options('0.0.0'), tasks: [previews] });
      } catch (thrown) {
        return thrown;
      }
    })();
    expect(error).toBeInstanceOf(MigrationError);
    expect((error as MigrationError).reason).toBe('downgrade');
  });

  it('accepts content recorded up to the running engine version', () => {
    seedLedger(rawDb, [baseline, addColor], [colors]);

    // The task was dropped from a later registry once it became moot; the
    // engine's own version still vouches for the row it left.
    expect(() =>
      openLedger(rawDb, { ...options('0.0.0'), engineVersion: '0.4.0' }),
    ).not.toThrow();
  });
});

describe('scripted migrations', () => {
  it('runs asynchronous work on files and the config', async () => {
    await writeFile(
      join(directory, 'thei.config.json'),
      JSON.stringify({ version: '0.1.0', legacy: true }),
    );
    await writeFile(join(directory, 'old-name.txt'), 'kept');

    const reorganize = defineMigration({
      id: '0.2.0/002-reorganize',
      version: '0.2.0',
      title: 'Reorganize files',
      async run({ contentPath, readConfig, writeConfig, log }) {
        const { rename } = await import('node:fs/promises');
        if (existsSync(contentPath('old-name.txt')))
          await rename(
            contentPath('old-name.txt'),
            contentPath('new-name.txt'),
          );
        await writeFile(contentPath('created.txt'), 'hello');
        const { legacy: _legacy, ...config } = await readConfig();
        await writeConfig({ ...config, reorganized: true });
        log('reorganized');
      },
    });

    const result = await runPendingMigrations(
      rawDb,
      options('0.0.0', [baseline, reorganize]),
    );

    expect(result.applied.map((migration) => migration.id)).toContain(
      '0.2.0/002-reorganize',
    );
    expect(existsSync(join(directory, 'old-name.txt'))).toBe(false);
    expect(await readFile(join(directory, 'new-name.txt'), 'utf8')).toBe(
      'kept',
    );
    expect(await readFile(join(directory, 'created.txt'), 'utf8')).toBe(
      'hello',
    );
    expect(
      JSON.parse(await readFile(join(directory, 'thei.config.json'), 'utf8')),
    ).toEqual({ version: '0.1.0', reorganized: true });
  });

  it('records nothing for a failed script, so the next boot retries it', async () => {
    let attempts = 0;
    const flaky = defineMigration({
      id: '0.2.0/001-flaky',
      version: '0.2.0',
      title: 'Flaky',
      async run({ contentPath }) {
        attempts += 1;
        await writeFile(contentPath('attempt.txt'), String(attempts));
        if (attempts === 1) throw new Error('network is down');
      },
    });

    await expect(
      runPendingMigrations(rawDb, options('0.0.0', [baseline, flaky])),
    ).rejects.toThrow('network is down');
    expect(readLedger(rawDb).map((entry) => entry.id)).not.toContain(
      '0.2.0/001-flaky',
    );

    const retry = await runPendingMigrations(
      rawDb,
      options('0.0.0', [baseline, flaky]),
    );
    expect(retry.applied.map((migration) => migration.id)).toEqual([
      '0.2.0/001-flaky',
    ]);
    expect(attempts).toBe(2);
  });
});
