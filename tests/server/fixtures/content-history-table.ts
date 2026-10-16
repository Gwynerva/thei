import type Database from 'better-sqlite3';
import { baselineSql } from '../../../update/migrations';

/**
 * The tables that say whether a file nothing places is still needed, the
 * anchors a text's headings have had, and those the AI keeps about
 * entities, cleared when an entity goes.
 */
const HOLD_TABLES = [
  'assets',
  'content-anchors',
  'content-history',
  'ai-actions',
  'ai-memory',
  'ai-digests',
  'ai-template-coverage',
  'ai-template-batches',
  'ai-session-entities',
];

/**
 * Adds the tables a save or a deletion of content consults — the files
 * themselves, the history of texts and the AI actions that hold them, the
 * anchors of headings, what the AI keeps about an entity — exactly as a
 * fresh installation has them, to a test database that builds only the
 * tables it needs by hand. One the test made itself stays.
 */
export function createContentHistoryTable(rawDb: Database.Database) {
  for (const table of HOLD_TABLES) {
    const exists = rawDb
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table);
    if (exists) continue;
    for (const statement of baselineSql.filter((sql) =>
      sql.includes(`\`${table}\``),
    ))
      rawDb.prepare(statement).run();
  }
}
