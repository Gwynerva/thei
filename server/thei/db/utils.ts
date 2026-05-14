import Database, { type Database as TDatabase } from 'better-sqlite3';
import {
  generateSQLiteMigration,
  generateSQLiteDrizzleJson,
} from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
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

export async function migrateDb() {
  const rawDb = new Database(THEI_SERVER.contentPath('thei.db'));
  const db = drizzle(rawDb, { schema });
  migrate(db, {
    migrationsFolder: THEI_SERVER.theiPath('server/thei/db/migrations'),
  });
}

export async function loadDbContext(): Promise<TheiDbContext> {
  const rawDb = new Database(THEI_SERVER.contentPath('thei.db'));
  const db = drizzle(rawDb, { schema });
  return { rawDb, db, schema };
}
