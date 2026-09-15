import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MigrationError,
  runPendingMigrations,
  seedLedger,
} from '../../update/migrations/run';
import { hasLedger, readLedger } from '../../update/migrations/ledger';
import { defineMigration } from '../../update/migrations/types';

const baseline = defineMigration({
  id: '0.0.1/001-baseline',
  version: '0.0.1',
  description: 'baseline',
  up({ rawDb }) {
    rawDb.prepare('CREATE TABLE notes (id TEXT PRIMARY KEY)').run();
  },
});

const addColor = defineMigration({
  id: '0.2.0/001-add-color',
  version: '0.2.0',
  description: 'add color',
  up({ rawDb }) {
    rawDb.prepare('ALTER TABLE notes ADD COLUMN color TEXT').run();
  },
});

const broken = defineMigration({
  id: '0.3.0/001-broken',
  version: '0.3.0',
  description: 'broken',
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

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-migrations-'));
  rawDb = new Database(join(directory, 'test.db'));
});

afterEach(async () => {
  rawDb.close();
  await rm(directory, { recursive: true, force: true });
});

describe('migration runner', () => {
  it('applies pending migrations in order and records them', () => {
    const result = runPendingMigrations(rawDb, options('0.0.0'));

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

  it('is a no-op on the second run', () => {
    runPendingMigrations(rawDb, options('0.0.0'));
    const second = runPendingMigrations(rawDb, options('0.0.0'));

    expect(second.applied).toEqual([]);
  });

  it('adopts a ledger-less database at its recorded version', () => {
    // A database created by an older Thei: the baseline schema is already
    // there, but nothing has ever been recorded.
    baseline.up({ rawDb, contentPath: () => '', log: () => {} });
    expect(hasLedger(rawDb)).toBe(false);

    const result = runPendingMigrations(rawDb, options('0.0.1'));

    expect(result.adopted).toBe(1);
    expect(result.applied.map((migration) => migration.id)).toEqual([
      '0.2.0/001-add-color',
    ]);
  });

  it('rolls back a failing migration and records nothing for it', () => {
    const result = runPendingMigrations(rawDb, options('0.0.0'));
    expect(result.applied).toHaveLength(2);

    expect(() =>
      runPendingMigrations(
        rawDb,
        options('0.0.0', [baseline, addColor, broken]),
      ),
    ).toThrow(MigrationError);

    const columns = rawDb
      .pragma("table_info('notes')")
      .map((column: any) => column.name);
    expect(columns).not.toContain('size');
    expect(readLedger(rawDb).map((entry) => entry.id)).not.toContain(
      '0.3.0/001-broken',
    );
  });

  it('reports the failing migration id', () => {
    try {
      runPendingMigrations(rawDb, options('0.0.0', [baseline, broken]));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError);
      expect((error as MigrationError).reason).toBe('migration-failed');
      expect((error as MigrationError).migrationId).toBe('0.3.0/001-broken');
    }
  });

  it('refuses to open content written by a newer Thei', () => {
    runPendingMigrations(rawDb, options('0.0.0', [baseline, addColor]));

    try {
      // The engine was downgraded: it no longer knows about 0.2.0.
      runPendingMigrations(rawDb, options('0.0.0', [baseline]));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError);
      expect((error as MigrationError).reason).toBe('downgrade');
      expect((error as MigrationError).message).toContain('0.2.0');
    }
  });

  it('replaces a ledger table left in an older, incompatible shape', () => {
    baseline.up({ rawDb, contentPath: () => '', log: () => {} });
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

    const result = runPendingMigrations(rawDb, options('0.0.1'));

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

  it('seeds every migration for a database built from the baseline', () => {
    seedLedger(rawDb, [baseline, addColor]);

    const result = runPendingMigrations(rawDb, options('0.2.0'));
    expect(result.applied).toEqual([]);
    expect(result.adopted).toBe(0);
  });
});
