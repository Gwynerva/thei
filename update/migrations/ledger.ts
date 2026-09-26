import type { Database } from 'better-sqlite3';

export const ledgerTable = '_thei_migrations';

/**
 * The ledger row of an update task. Tasks share the ledger with migrations;
 * the prefix keeps their ids apart, whatever the two registries are named.
 */
export function taskLedgerId(id: string): string {
  return `task:${id}`;
}

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

/** The ledger has kept one shape since 0.0.1, the first release. */
export function hasLedger(rawDb: Database): boolean {
  const row = rawDb
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(ledgerTable);

  return row !== undefined;
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
