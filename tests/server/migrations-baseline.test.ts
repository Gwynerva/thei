import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from 'drizzle-kit/api';
import { schema } from '../../server/thei/db/schema';
import { baselineSql, migrationRegistry } from '../../update/migrations';
import { runPendingMigrations, seedLedger } from '../../update/migrations/run';

interface SchemaObject {
  type: string;
  name: string;
  sql: string | null;
}

function dumpSchema(rawDb: Database.Database): SchemaObject[] {
  return (
    rawDb
      .prepare(
        `SELECT type, name, sql FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' AND name != '_thei_migrations'
         ORDER BY type, name`,
      )
      .all() as SchemaObject[]
  ).map((row) => ({
    ...row,
    // Whitespace is not meaningful in DDL and differs between the generator
    // and what SQLite stores back.
    sql: row.sql?.replace(/\s+/g, ' ').trim() ?? null,
  }));
}

async function withTempDb<T>(
  run: (rawDb: Database.Database) => T | Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'thei-baseline-'));
  const rawDb = new Database(join(directory, 'test.db'));
  try {
    return await run(rawDb);
  } finally {
    rawDb.close();
    await rm(directory, { recursive: true, force: true });
  }
}

describe('migration baseline', () => {
  it('produces exactly the schema Drizzle would generate today', async () => {
    const generated = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson(schema),
    );

    const fromDrizzle = await withTempDb((rawDb) => {
      for (const statement of generated) rawDb.prepare(statement).run();
      return dumpSchema(rawDb);
    });

    const fromBaseline = await withTempDb(async (rawDb) => {
      for (const statement of baselineSql) rawDb.prepare(statement).run();
      seedLedger(rawDb, migrationRegistry.slice(0, 1));
      await runPendingMigrations(rawDb, {
        installedVersion: '0.0.0',
        contentPath: (...parts: string[]) => join(...parts),
      });
      return dumpSchema(rawDb);
    });

    expect(fromBaseline).toEqual(fromDrizzle);
  });

  it('keeps the registry ordered and uniquely identified', () => {
    const ids = migrationRegistry.map((migration) => migration.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const migration of migrationRegistry) {
      expect(migration.id.startsWith(`${migration.version}/`)).toBe(true);
    }
  });
});
