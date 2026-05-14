import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database } from 'better-sqlite3';
import { schema } from './schema';

export interface TheiDbContext {
  rawDb: Database;
  db: BetterSQLite3Database<typeof schema>;
  schema: typeof schema;
}

let theiDbContext: TheiDbContext | undefined;

export function setTheiDbContext(dbContext: TheiDbContext) {
  theiDbContext = dbContext;
}

export function getTheiDbContext(): TheiDbContext {
  if (!theiDbContext) {
    throw new Error('Database has not been initialized yet.');
  }
  return theiDbContext;
}
