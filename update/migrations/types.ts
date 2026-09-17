import type { Database } from 'better-sqlite3';
import type { UpdateText } from '../text';

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
  /** `content/thei.config.json` as a plain object. */
  readConfig: () => Promise<Record<string, unknown>>;
  /** Atomically replaces `content/thei.config.json`. */
  writeConfig: (config: Record<string, unknown>) => Promise<void>;
  log: (message: string) => void;
}

interface TheiMigrationBase {
  /**
   * Stable, unique identifier, by convention `<version>/<order>-<slug>`, for
   * example `0.2.0/001-add-project-colors`. This is what the ledger stores, so
   * it must never change once a release carrying it has shipped.
   */
  id: string;
  /** The release this migration belongs to. */
  version: string;
  /** Shown in the update panel while the migration runs. */
  title: UpdateText;
  description?: UpdateText;
}

/**
 * A transactional migration: its SQL, any synchronous file work, and its
 * ledger row commit together or not at all.
 */
export interface TheiTransactionalMigration extends TheiMigrationBase {
  up: (context: MigrationContext) => void;
  run?: never;
}

/**
 * A scripted migration: arbitrary asynchronous work — files, the config, child
 * processes — with no transaction around it. The ledger row is written only
 * after `run` resolves, so a failed run is retried on the next boot and must be
 * safe to repeat.
 */
export interface TheiScriptedMigration extends TheiMigrationBase {
  run: (context: MigrationContext) => Promise<void>;
  up?: never;
}

export type TheiMigration = TheiTransactionalMigration | TheiScriptedMigration;

export function defineMigration<T extends TheiMigration>(migration: T): T {
  return migration;
}
