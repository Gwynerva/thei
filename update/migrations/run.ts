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
import { readConfigFile, writeConfigFile } from '../config-file';
import { resolveUpdateText } from '../text';
import type { MigrationContext, TheiMigration } from './types';

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
  /** Progress of each pending migration, for the update panel. */
  onProgress?: (event: MigrationProgressEvent) => void | Promise<void>;
  registry?: TheiMigration[];
}

export type MigrationProgressEvent =
  | { type: 'plan'; migrations: TheiMigration[] }
  | { type: 'start'; migration: TheiMigration }
  | { type: 'done'; migration: TheiMigration }
  | { type: 'fail'; migration: TheiMigration; error: string };

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
 * A transactional migration and its ledger row commit together, so an
 * interrupted run leaves the database on a clean migration boundary. A scripted
 * one is recorded once it has finished. Either way a run simply resumes on the
 * next boot.
 */
export async function runPendingMigrations(
  rawDb: Database,
  options: RunMigrationsOptions,
): Promise<RunMigrationsResult> {
  const registry = options.registry ?? migrationRegistry;
  const log = options.log ?? (() => {});
  const progress = async (event: MigrationProgressEvent) => {
    await options.onProgress?.(event);
  };

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
  const configPath = options.contentPath('thei.config.json');
  const context: MigrationContext = {
    rawDb,
    contentPath: options.contentPath,
    readConfig: () => readConfigFile(configPath),
    writeConfig: (config) => writeConfigFile(configPath, config),
    log,
  };

  if (pending.length) await progress({ type: 'plan', migrations: pending });

  for (const migration of pending) {
    log(`Applying ${migration.id} — ${resolveUpdateText(migration.title)}`);
    await progress({ type: 'start', migration });

    try {
      if (migration.run) {
        await migration.run(context);
        recordMigration(rawDb, migration.id, migration.version);
      } else {
        rawDb.transaction(() => {
          migration.up(context);
          recordMigration(rawDb, migration.id, migration.version);
        })();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await progress({ type: 'fail', migration, error: message });
      throw new MigrationError(
        `Migration ${migration.id} failed: ${message}`,
        'migration-failed',
        migration.id,
      );
    }

    await progress({ type: 'done', migration });
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
