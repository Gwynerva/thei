import {
  applyMigrations,
  MigrationError,
  openLedger,
} from '#layers/thei/update/migrations/run';
import { migrationStepId } from '#layers/thei/update/boot-run';
import { updateTaskRegistry } from '#layers/thei/update/tasks';
import type { TheiUpdateTask } from '#layers/thei/update/tasks/types';
import { setBootUpdate, setBootUpdating } from '../boot/result';
import { openUpdateBootRun } from '../updates/boot';
import { setTheiDbContext } from './global';
import { openDb, wrapDbContext } from './utils';

/**
 * Opens the database and brings its schema up to date.
 *
 * When the ledger has anything left for this release, the site is closed
 * first — requests are told it is updating instead of waiting — and stays
 * closed through the migrations and the tasks after them. Returns the tasks,
 * which run once the rest of the server can be used.
 */
export async function bootTheiDb(): Promise<TheiUpdateTask[]> {
  const installedVersion = THEI_SERVER.config.version;
  const log = (message: string) =>
    THEI_SERVER.console.tag('Migrations').log(message);
  const rawDb = openDb();

  try {
    const pending = openLedger(rawDb, {
      installedVersion,
      engineVersion: THEI_SERVER.version,
      tasks: updateTaskRegistry,
      log,
    });

    const run = await openUpdateBootRun(pending);
    if (run.pending) {
      setBootUpdating();
      THEI_SERVER.console
        .tag('Boot')
        .log('The site is closed until the update is finished.');
    }

    // Migrations run before anything reads or repairs the schema: the rest of
    // the boot path assumes the database already matches this release.
    await applyMigrations(rawDb, pending.pendingMigrations, {
      contentPath: (...parts) => THEI_SERVER.contentPath(...parts),
      log: run.log,
      onProgress: async (event) => {
        const stepId = migrationStepId(event.migration.id);
        if (event.type === 'start') await run.start(stepId);
        if (event.type === 'done') await run.done(stepId);
        if (event.type === 'fail') await run.fail(stepId, event.error);
      },
    });

    setTheiDbContext(wrapDbContext(rawDb));
    THEI_SERVER.console.tag('Boot').log('Database ready!');
    return pending.pendingTasks;
  } catch (error) {
    rawDb.close();

    if (error instanceof MigrationError) {
      // Not a crash: the process stays up with the site closed, and the
      // update screen says which step stopped and why.
      setBootUpdate({
        reason: error.reason,
        stepId:
          error.reason === 'migration-failed' && error.migrationId
            ? migrationStepId(error.migrationId)
            : undefined,
        fromVersion: installedVersion,
        toVersion: THEI_SERVER.version,
        message: error.message,
      });
    }

    throw error;
  }
}
