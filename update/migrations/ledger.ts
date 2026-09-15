import type { Database } from 'better-sqlite3';

export const ledgerTable = '_thei_migrations';

export interface LedgerEntry {
  id: string;
  version: string;
  appliedAt: number;
}

export function createLedger(rawDb: Database): void {
  rawDb
    .prepare(
      `CREATE TABLE IF NOT EXISTS \`${ledgerTable}\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`version\` text NOT NULL,
        \`appliedAt\` integer NOT NULL
      )`,
    )
    .run();
}

const ledgerColumns = ['id', 'version', 'appliedAt'];

function ledgerTableExists(rawDb: Database): boolean {
  const row = rawDb
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(ledgerTable);

  return row !== undefined;
}

/**
 * True only when the ledger is present *and* has the shape this version reads.
 *
 * A table of the same name but a different shape is treated as absent, so the
 * caller drops it and rebuilds the history from the recorded version. Nothing
 * is lost: the ledger is bookkeeping, always reconstructible from the version
 * in `thei.config.json`.
 */
export function hasLedger(rawDb: Database): boolean {
  if (!ledgerTableExists(rawDb)) return false;

  const columns = (
    rawDb.pragma(`table_info('${ledgerTable}')`) as { name: string }[]
  ).map((column) => column.name);

  return ledgerColumns.every((column) => columns.includes(column));
}

export function dropLedger(rawDb: Database): void {
  rawDb.prepare(`DROP TABLE IF EXISTS \`${ledgerTable}\``).run();
}

export function readLedger(rawDb: Database): LedgerEntry[] {
  return rawDb
    .prepare(`SELECT id, version, appliedAt FROM \`${ledgerTable}\``)
    .all() as LedgerEntry[];
}

export function recordMigration(
  rawDb: Database,
  id: string,
  version: string,
): void {
  rawDb
    .prepare(
      `INSERT OR REPLACE INTO \`${ledgerTable}\` (id, version, appliedAt)
       VALUES (?, ?, ?)`,
    )
    .run(id, version, Date.now());
}
