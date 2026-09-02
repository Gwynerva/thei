import Database from 'better-sqlite3';
import {
  generateSQLiteMigration,
  generateSQLiteDrizzleJson,
} from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { schema } from './schema';
import type { TheiDbContext } from './global';

export async function createFreshDbContext(): Promise<TheiDbContext> {
  const migration = await generateSQLiteMigration(
    await generateSQLiteDrizzleJson({}),
    await generateSQLiteDrizzleJson(schema),
  );
  const rawDb = new Database(THEI_SERVER.contentPath('thei.db'));
  try {
    rawDb.transaction(() => {
      for (const query of migration) rawDb.prepare(query).run();
    })();
    const db = drizzle(rawDb, { schema });
    return { rawDb, db, schema };
  } catch (error) {
    rawDb.close();
    throw error;
  }
}

export async function loadDbContext(): Promise<TheiDbContext> {
  const rawDb = new Database(THEI_SERVER.contentPath('thei.db'));
  const db = drizzle(rawDb, { schema });
  return { rawDb, db, schema };
}
