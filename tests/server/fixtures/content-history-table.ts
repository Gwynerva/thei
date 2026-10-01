import type Database from 'better-sqlite3';
import { baselineSql } from '../../../update/migrations';

/**
 * Adds the content history table, exactly as a fresh installation has it, to
 * a test database that builds only the tables it needs by hand. Saving and
 * deleting content write to it.
 */
export function createContentHistoryTable(rawDb: Database.Database) {
  for (const statement of baselineSql.filter((sql) =>
    sql.includes('`content-history`'),
  ))
    rawDb.prepare(statement).run();
}
