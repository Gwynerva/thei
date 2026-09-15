import type { Database } from 'better-sqlite3';
import { compareVersions } from '../semver';
import { migrationRegistry } from './index';
import {
  createLedger,
  dropLedger,
  hasLedger,
  readLedger,
  recordMigration,
} from './ledger';
import type { TheiMigration } from './types';

export class MigrationError extends Error {
  readonly reason: 'migration-failed' | 'downgrade';
  readonly migrationId?: string;

  constructor(
    message: string,
    reason: 'migration-failed' | 'downgrade',
    migrationId?: string,
  ) {
    super(message);
    this.name = 'MigrationError';
    this.reason = reason;
    this.migrationId = migrationId;
  }
}

export interface RunMigrationsOptions {
  /** Data version recorded in `thei.config.json`. */
  installedVersion: string;
  contentPath: (...parts: string[]) => string;
  log?: (message: string) => void;
  registry?: TheiMigration[];
}

export interface RunMigrationsResult {
  applied: TheiMigration[];
  adopted: number;
}

/** Marks every known migration as applied — for a database just created from the baseline. */
export function seedLedger(
  rawDb: Database,
  registry: TheiMigration[] = migrationRegistry,
): void {
  createLedger(rawDb);
  rawDb.transaction(() => {
    for (const migration of registry) {
      recordMigration(rawDb, migration.id, migration.version);
    }
  })();
}

/**
 * Brings a database up to date with the registry.
 *
 * Each migration and its ledger row commit in a single transaction, so an
 * interrupted run leaves the database on a clean migration boundary and simply
 * resumes on the next boot.
 */
export function runPendingMigrations(
  rawDb: Database,
  options: RunMigrationsOptions,
): RunMigrationsResult {
  const registry = options.registry ?? migrationRegistry;
  const log = options.log ?? (() => {});

  let adopted = 0;

  // A database created before the ledger existed already contains everything
  // its recorded version shipped with, so those migrations are adopted rather
  // than replayed.
  if (!hasLedger(rawDb)) {
    // Also clears a ledger table left behind in an older, incompatible shape.
    dropLedger(rawDb);
    createLedger(rawDb);
    const inherited = registry.filter(
      (migration) =>
        compareVersions(migration.version, options.installedVersion) <= 0,
    );

    rawDb.transaction(() => {
      for (const migration of inherited) {
        recordMigration(rawDb, migration.id, migration.version);
      }
    })();

    adopted = inherited.length;
    if (adopted) {
      log(`Adopted ${adopted} migration(s) already present in this database.`);
    }
  }

  const entries = readLedger(rawDb);
  const appliedIds = new Set(entries.map((entry) => entry.id));

  assertNotDowngraded(entries, registry);

  const pending = registry.filter((migration) => !appliedIds.has(migration.id));
  const applied: TheiMigration[] = [];

  for (const migration of pending) {
    log(`Applying ${migration.id} — ${migration.description}`);

    try {
      rawDb.transaction(() => {
        migration.up({
          rawDb,
          contentPath: options.contentPath,
          log,
        });
        recordMigration(rawDb, migration.id, migration.version);
      })();
    } catch (error) {
      throw new MigrationError(
        `Migration ${migration.id} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'migration-failed',
        migration.id,
      );
    }

    applied.push(migration);
  }

  if (applied.length) {
    log(`Applied ${applied.length} migration(s).`);
  }

  return { applied, adopted };
}

function assertNotDowngraded(
  entries: { id: string; version: string }[],
  registry: TheiMigration[],
): void {
  if (!entries.length) return;

  const newestKnown = registry.at(-1)?.version ?? '0.0.0';

  for (const entry of entries) {
    if (compareVersions(entry.version, newestKnown) > 0) {
      throw new MigrationError(
        `This content was created by Thei ${entry.version}, which is newer than ` +
          `the running version. Downgrading is not supported — reinstall ` +
          `Thei ${entry.version} or newer.`,
        'downgrade',
        entry.id,
      );
    }
  }
}
