import type { Database } from 'better-sqlite3';
import { compareVersions, newestVersion } from '../semver';
import { migrationRegistry } from './index';
import {
  createLedger,
  hasLedger,
  readLedger,
  recordMigration,
  taskLedgerId,
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

/**
 * What the ledger needs to know about an update task. Typed by shape, so the
 * migration runner never imports the tasks, which are engine code.
 */
export interface LedgerTask {
  id: string;
  version: string;
}

export interface OpenLedgerOptions<Task extends LedgerTask> {
  /**
   * Version of the running engine. Content recorded by anything newer than
   * both this and the registries is refused as a downgrade.
   */
  engineVersion?: string;
  registry?: TheiMigration[];
  tasks?: Task[];
  log?: (message: string) => void;
}

export interface OpenLedgerResult<Task extends LedgerTask> {
  pendingMigrations: TheiMigration[];
  pendingTasks: Task[];
}

/**
 * Reads what the database has already been through, and what is left.
 *
 * An empty database starts a new ledger. Content recorded by a newer Thei is
 * refused.
 */
export function openLedger<Task extends LedgerTask>(
  rawDb: Database,
  options: OpenLedgerOptions<Task>,
): OpenLedgerResult<Task> {
  const registry = options.registry ?? migrationRegistry;
  const tasks = options.tasks ?? [];
  const log = options.log ?? (() => {});

  if (!hasLedger(rawDb)) {
    // Every released Thei records its steps, starting with 0.0.1's baseline.
    // Tables without a ledger were made by something else.
    if (hasTables(rawDb)) {
      throw new Error(
        'This database has no migration ledger: it was not created by a ' +
          'released Thei, so there is no telling which steps it went through.',
      );
    }
    createLedger(rawDb);
    log('Starting a new migration ledger.');
  }

  const entries = readLedger(rawDb);
  const appliedIds = new Set(entries.map((entry) => entry.id));

  assertNotDowngraded(
    entries,
    newestVersion([
      ...registry.map((migration) => migration.version),
      ...tasks.map((task) => task.version),
      ...(options.engineVersion ? [options.engineVersion] : []),
    ]) ?? '0.0.0',
  );

  return {
    pendingMigrations: registry.filter(
      (migration) => !appliedIds.has(migration.id),
    ),
    pendingTasks: tasks.filter(
      (task) => !appliedIds.has(taskLedgerId(task.id)),
    ),
  };
}

export type MigrationProgressEvent =
  | { type: 'start'; migration: TheiMigration }
  | { type: 'done'; migration: TheiMigration }
  | { type: 'fail'; migration: TheiMigration; error: string };

export interface ApplyMigrationsOptions {
  contentPath: (...parts: string[]) => string;
  log?: (message: string) => void;
  /** Progress of each migration, for the update screen. */
  onProgress?: (event: MigrationProgressEvent) => void | Promise<void>;
}

/**
 * Applies the given migrations in order.
 *
 * A transactional migration and its ledger row commit together, so an
 * interrupted run leaves the database on a clean migration boundary. A scripted
 * one is recorded once it has finished. Either way a run simply resumes on the
 * next boot.
 */
export async function applyMigrations(
  rawDb: Database,
  migrations: TheiMigration[],
  options: ApplyMigrationsOptions,
): Promise<TheiMigration[]> {
  const log = options.log ?? (() => {});
  const progress = async (event: MigrationProgressEvent) => {
    await options.onProgress?.(event);
  };

  const applied: TheiMigration[] = [];
  const configPath = options.contentPath('thei.config.json');
  const context: MigrationContext = {
    rawDb,
    contentPath: options.contentPath,
    readConfig: () => readConfigFile(configPath),
    writeConfig: (config) => writeConfigFile(configPath, config),
    log,
  };

  for (const migration of migrations) {
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

  return applied;
}

export interface RunMigrationsOptions
  extends OpenLedgerOptions<LedgerTask>, ApplyMigrationsOptions {}

export interface RunMigrationsResult {
  applied: TheiMigration[];
}

/**
 * Brings a database's schema up to date with the registry: opens the ledger
 * and applies every pending migration. Tasks are left to the caller.
 */
export async function runPendingMigrations(
  rawDb: Database,
  options: RunMigrationsOptions,
): Promise<RunMigrationsResult> {
  const { pendingMigrations } = openLedger(rawDb, options);
  const applied = await applyMigrations(rawDb, pendingMigrations, options);
  return { applied };
}

/**
 * Marks every known migration and task as applied — for a database just
 * created from the baseline, which has neither old schema nor old content.
 */
export function seedLedger(
  rawDb: Database,
  registry: TheiMigration[] = migrationRegistry,
  tasks: LedgerTask[] = [],
): void {
  createLedger(rawDb);
  rawDb.transaction(() => {
    for (const migration of registry) {
      recordMigration(rawDb, migration.id, migration.version);
    }
    for (const task of tasks) {
      recordMigration(rawDb, taskLedgerId(task.id), task.version);
    }
  })();
}

function hasTables(rawDb: Database): boolean {
  return (
    rawDb
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
      )
      .get() !== undefined
  );
}

function assertNotDowngraded(
  entries: { id: string; version: string }[],
  newestKnown: string,
): void {
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
