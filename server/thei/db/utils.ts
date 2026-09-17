import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { schema } from './schema';
import type { TheiDbContext } from './global';
import { ensureAssetIntegrity } from '../assets/schema-integrity';
import { baselineSql } from '#layers/thei/update/migrations';
import {
  runPendingMigrations,
  seedLedger,
} from '#layers/thei/update/migrations/run';
import { migrationProgressRecorder } from '#layers/thei/update/migration-progress';

export async function createFreshDbContext(): Promise<TheiDbContext> {
  const rawDb = new Database(THEI_SERVER.contentPath('thei.db'));
  try {
    rawDb.transaction(() => {
      for (const query of baselineSql) rawDb.prepare(query).run();
    })();
    // The baseline already describes the newest schema, so every known
    // migration counts as applied.
    seedLedger(rawDb);
    const db = drizzle(rawDb, { schema });
    ensureAssetIntegrity(rawDb);
    return { rawDb, db, schema };
  } catch (error) {
    rawDb.close();
    throw error;
  }
}

export async function loadDbContext(): Promise<TheiDbContext> {
  const rawDb = new Database(THEI_SERVER.contentPath('thei.db'));
  try {
    // Migrations run before anything reads or repairs the schema: the rest of
    // the boot path assumes the database already matches this release.
    await runPendingMigrations(rawDb, {
      installedVersion: THEI_SERVER.config.version,
      contentPath: (...parts) => THEI_SERVER.contentPath(...parts),
      log: (message) => THEI_SERVER.console.tag('Migrations').log(message),
      onProgress: await migrationProgressRecorder(
        THEI_SERVER.projectPath(),
        THEI_SERVER.config.languageCode,
      ),
    });
    ensureAssetIntegrity(rawDb);
    const db = drizzle(rawDb, { schema });
    return { rawDb, db, schema };
  } catch (error) {
    rawDb.close();
    throw error;
  }
}
