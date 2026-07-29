import Database from 'better-sqlite3';
import {
  generateSQLiteMigration,
  generateSQLiteDrizzleJson,
} from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { schema } from './schema';
import type { TheiDbContext } from './global';

export async function createFreshDbContext(): Promise<TheiDbContext> {
  const rawDb = new Database(THEI_SERVER.contentPath('thei.db'));

  const migration = await generateSQLiteMigration(
    await generateSQLiteDrizzleJson({}),
    await generateSQLiteDrizzleJson(schema),
  );
  for (const query of migration) {
    rawDb.prepare(query).run();
  }

  const db = drizzle(rawDb, { schema });

  return { rawDb, db, schema };
}

export async function loadDbContext(): Promise<TheiDbContext> {
  const rawDb = new Database(THEI_SERVER.contentPath('thei.db'));
  const db = drizzle(rawDb, { schema });
  return { rawDb, db, schema };
}
