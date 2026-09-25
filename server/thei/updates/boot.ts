import { openBootRun, type BootRun } from '#layers/thei/update/boot-run';
import { readConfigFile } from '#layers/thei/update/config-file';
import { isManaged } from '#layers/thei/update/environment';
import { checkForUpdate } from '#layers/thei/update/remote';
import { updateRuntime } from '#layers/thei/update/runtime';
import {
  runUpdateTasks,
  TaskError,
  taskStepId,
} from '#layers/thei/update/tasks/run';
import type { TheiUpdateTask } from '#layers/thei/update/tasks/types';
import type { TheiMigration } from '#layers/thei/update/migrations/types';
import { writeInstalledVersion } from '#layers/thei/update/version-file';
import { setBootUpdate } from '../boot/result';
import { setTheiConfig, type TheiConfig } from '../config';

const CHECK_DELAY_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Looks for a newer release in the background, so the dashboard can point at
 * it without anyone opening Updates. Only a supervised instance can update
 * itself, so only there is the answer worth a network round trip.
 */
export function bootUpdateChecks() {
  if (!isManaged()) return;
  setTimeout(runCheck, CHECK_DELAY_MS).unref();
  setInterval(runCheck, CHECK_INTERVAL_MS).unref();
}

async function runCheck() {
  try {
    await checkForUpdate(THEI_SERVER.projectPath());
  } catch (error) {
    THEI_SERVER.console.tag('Update').error('Background check failed', error);
  }
}

/** The update run this boot reports into, once the database is open. */
let bootRun: BootRun | undefined;

/**
 * Picks up the update this boot finishes — the one that restarted into it,
 * or the work the ledger has left — and records the steps it has to take.
 */
export async function openUpdateBootRun(pending: {
  pendingMigrations: TheiMigration[];
  pendingTasks: TheiUpdateTask[];
}): Promise<BootRun> {
  const runtime = updateRuntime();
  bootRun = await openBootRun({
    projectPath: runtime.projectPath,
    currentVersion: runtime.currentVersion,
    installedVersion: THEI_SERVER.config.version,
    languageCode: runtime.languageCode,
    migrations: pending.pendingMigrations,
    tasks: pending.pendingTasks,
    log: runtime.log,
  });
  return bootRun;
}

/**
 * Runs the tasks the ledger has left, with the site still closed, then
 * records the content as belonging to this version. A task that fails keeps
 * the site closed: the release may count on its result.
 */
export async function bootUpdateTasks(tasks: TheiUpdateTask[]) {
  const installedVersion = THEI_SERVER.config.version;

  if (tasks.length) {
    const run = bootRun;
    if (!run) throw new Error('Update tasks ran before their run was opened.');
    try {
      await runUpdateTasks(THEI_SERVER.useDb().rawDb, tasks, {
        languageCode: THEI_SERVER.config.languageCode,
        log: run.log,
        report: run,
      });
    } catch (error) {
      if (error instanceof TaskError) {
        setBootUpdate({
          reason: 'task-failed',
          stepId: taskStepId({ id: error.taskId }),
          fromVersion: installedVersion,
          toVersion: THEI_SERVER.version,
          message: error.message,
        });
      }
      throw error;
    }
  }

  if (installedVersion !== THEI_SERVER.version) {
    // Read back from disk: a migration may have rewritten the config.
    const configPath = THEI_SERVER.contentPath('thei.config.json');
    const config = (await writeInstalledVersion(
      configPath,
      THEI_SERVER.version,
      await readConfigFile(configPath),
    )) as unknown as TheiConfig;

    setTheiConfig(config);

    THEI_SERVER.console
      .tag('Boot')
      .log(
        `Content updated from ${installedVersion} to ${THEI_SERVER.version}.`,
      );
  }
}

/** Settles the run as done, right before the site opens. */
export async function finishUpdateBootRun() {
  await bootRun?.finish();
}

/**
 * Settles the run as failed when the boot breaks for a reason of its own, so
 * the update screen shows the error instead of waiting for ever.
 */
export async function failUpdateBootRun(message: string) {
  await bootRun?.fail(undefined, message);
}
