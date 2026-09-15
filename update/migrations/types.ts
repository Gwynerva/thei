import type { Database } from 'better-sqlite3';

export interface MigrationContext {
  /**
   * The raw SQLite handle. Migrations must use raw SQL and must never import
   * the Drizzle schema: that schema always describes the *current* release,
   * while a migration has to keep describing the database as it looked when
   * the migration was written.
   */
  rawDb: Database;
  /** Absolute path inside the instance content directory. */
  contentPath: (...parts: string[]) => string;
  log: (message: string) => void;
}

export interface TheiMigration {
  /**
   * Stable, unique identifier, by convention `<version>/<order>-<slug>`, for
   * example `0.2.0/001-add-project-colors`. This is what the ledger stores, so
   * it must never change once a release carrying it has shipped.
   */
  id: string;
  /** The release this migration belongs to. */
  version: string;
  description: string;
  up: (context: MigrationContext) => void;
}

export function defineMigration(migration: TheiMigration): TheiMigration {
  return migration;
}
