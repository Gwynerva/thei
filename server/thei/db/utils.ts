import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { schema } from './schema';
import type { TheiDbContext } from './global';
import { ensureAssetIntegrity } from '../assets/schema-integrity';
import { baselineSql } from '#layers/thei/update/migrations';
import { seedLedger } from '#layers/thei/update/migrations/run';
import { updateTaskRegistry } from '#layers/thei/update/tasks';

export async function createFreshDbContext(): Promise<TheiDbContext> {
  const rawDb = openDb();
  try {
    rawDb.transaction(() => {
      for (const query of baselineSql) rawDb.prepare(query).run();
    })();
    // The baseline already describes the newest schema, and a new site has no
    // old content, so every known migration and task counts as applied.
    seedLedger(rawDb, undefined, updateTaskRegistry);
    return wrapDbContext(rawDb);
  } catch (error) {
    rawDb.close();
    throw error;
  }
}

export function openDb(): Database.Database {
  return new Database(THEI_SERVER.contentPath('thei.db'));
}

/**
 * The context the rest of the server works with, over a database whose schema
 * already matches this release.
 */
export function wrapDbContext(rawDb: Database.Database): TheiDbContext {
  ensureAssetIntegrity(rawDb);
  const db = drizzle(rawDb, { schema });
  return { rawDb, db, schema };
}
