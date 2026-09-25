import { normalizeVersion } from './semver';
import {
  appendLog,
  createUpdateState,
  finishStep,
  pendingStep,
  planSteps,
  readUpdateState,
  setStatus,
  settleSteps,
  startStep,
  writeUpdateState,
} from './state';
import { taskStepId, type UpdateTaskReporter } from './tasks/run';
import { resolveUpdateText, type UpdateText } from './text';
import { isRunningStatus, type UpdateState, type UpdateStep } from './types';

/** The step a migration is shown as. */
export function migrationStepId(id: string): string {
  return `migration:${id}`;
}

export interface BootRunStep {
  id: string;
  title: UpdateText;
  description?: UpdateText;
}

export interface OpenBootRunOptions {
  projectPath: string;
  /** Version of the engine that is booting. */
  currentVersion: string;
  /** Version the content was last brought to, from `thei.config.json`. */
  installedVersion: string;
  /** Site language, which step titles are recorded in. */
  languageCode?: string;
  /** Pending migrations, in the order they will run. */
  migrations: BootRunStep[];
  /** Pending tasks, in the order they will run after the migrations. */
  tasks: BootRunStep[];
  log: (message: string) => void;
}

/**
 * The update run as this boot records it: the steps it still has to take,
 * reported as they happen, into the state file the update screen polls.
 */
export interface BootRun extends UpdateTaskReporter {
  /** Whether the boot has update work to do. The site stays closed until then. */
  readonly pending: boolean;
  /** The run being recorded, if this boot records one. */
  readonly state: UpdateState | undefined;
  /** Goes to the run's log, and the server's. */
  log: (message: string) => void;
  /** Ends the run as failed, on the given step if there is one. */
  fail: (stepId: string | undefined, message: string) => Promise<void>;
  /** Ends the run as done, once the site is about to open. */
  finish: () => Promise<void>;
}

/**
 * Opens the run this boot reports into. The one place a run is picked up
 * after a restart, so the rules live together:
 *
 * - A run in progress towards another version never reached it: the restart
 *   did not take effect, or the server stopped mid-update. It is settled as
 *   failed.
 * - A run towards this version that got past its restart and is not done
 *   goes on as this process's own: the restart that ends every update, a
 *   retry after a failed step, a server stopped mid-task. What is still
 *   pending is planned again from the ledger; what is done stays done.
 * - Otherwise, pending work — content restored from an older backup, an
 *   engine updated by hand — gets a run of its own, so the closed site can
 *   say what it is doing.
 */
export async function openBootRun(
  options: OpenBootRunOptions,
): Promise<BootRun> {
  const step = (
    id: string,
    kind: UpdateStep['kind'],
    source: BootRunStep,
  ): UpdateStep =>
    pendingStep(
      id,
      kind,
      resolveUpdateText(source.title, options.languageCode),
      resolveUpdateText(source.description, options.languageCode),
    );
  const planned: UpdateStep[] = [
    ...options.migrations.map((migration) =>
      step(migrationStepId(migration.id), 'migration', migration),
    ),
    ...options.tasks.map((task) => step(taskStepId(task), 'task', task)),
  ];
  const pending = planned.length > 0;
  const current = normalizeVersion(options.currentVersion);

  let state = await readUpdateState(options.projectPath);

  async function write() {
    if (!state) return;
    try {
      await writeUpdateState(options.projectPath, state);
    } catch (error) {
      // Bookkeeping never stops a boot: the site matters more than its log.
      options.log(
        `Could not record the update: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (
    state &&
    isRunningStatus(state.status) &&
    normalizeVersion(state.toVersion) !== current
  ) {
    const message =
      state.status === 'restarting'
        ? `The update did not take effect: expected ${state.toVersion}, running ${options.currentVersion}.`
        : 'The server stopped while updating.';
    if (state.status === 'restarting') {
      finishStep(state, 'restart', 'failed', message);
    }
    state.error = message;
    appendLog(state, message);
    setStatus(state, 'failed');
    settleSteps(state);
    await write();
  }

  if (
    state &&
    normalizeVersion(state.toVersion) === current &&
    state.status !== 'done' &&
    pastRestart(state)
  ) {
    continueRun(state, planned, options.currentVersion);
    await write();
  } else if (pending) {
    state = createUpdateState(
      options.installedVersion,
      options.currentVersion,
      planned,
    );
    appendLog(
      state,
      `Bringing the content from Thei ${options.installedVersion} to ${options.currentVersion}.`,
    );
    await write();
  } else {
    state = undefined;
  }

  const find = (id: string) => state?.steps.find((item) => item.id === id);

  return {
    pending,
    get state() {
      return state;
    },
    log(message) {
      if (state) appendLog(state, message);
      options.log(message);
    },
    async start(id) {
      if (!state) return;
      startStep(state, id);
      await write();
    },
    async progress(id, value) {
      const target = find(id);
      if (!target || target.description === value) return;
      target.description = value;
      await write();
    },
    async done(id) {
      if (!state) return;
      finishStep(state, id, 'done');
      await write();
    },
    async fail(id, message) {
      if (!state) return;
      if (id) finishStep(state, id, 'failed', message);
      state.error = message;
      appendLog(state, message);
      setStatus(state, 'failed');
      settleSteps(state);
      await write();
    },
    async finish() {
      if (!state || !isRunningStatus(state.status)) return;
      appendLog(state, `Thei ${options.currentVersion} is ready.`);
      setStatus(state, 'done');
      settleSteps(state);
      await write();
    },
  };
}

/**
 * Whether a run got as far as its restart. A run that failed before it — a
 * build that broke — belongs to the version that is still running, not to
 * this one, even when an engine was later installed by hand.
 */
function pastRestart(state: UpdateState): boolean {
  if (state.status === 'restarting') return true;
  const restart = state.steps.find((step) => step.id === 'restart');
  return !restart || restart.status === 'done';
}

function continueRun(
  state: UpdateState,
  planned: UpdateStep[],
  currentVersion: string,
): void {
  const restart = state.steps.find((step) => step.id === 'restart');
  if (restart && restart.status !== 'done') {
    finishStep(state, 'restart', 'done');
    appendLog(state, `Now running Thei ${currentVersion}.`);
  } else if (state.status === 'failed') {
    appendLog(state, 'Trying again.');
  }

  // A step that was running when the process stopped, and that the ledger no
  // longer lists, did finish; it just never got to say so.
  const plannedIds = new Set(planned.map((step) => step.id));
  for (const step of state.steps) {
    if (step.status === 'running' && !plannedIds.has(step.id)) {
      finishStep(state, step.id, 'done');
    }
  }

  for (const step of planned) {
    const existing = state.steps.find((item) => item.id === step.id);
    if (!existing) continue;
    existing.status = 'pending';
    delete existing.startedAt;
    delete existing.finishedAt;
    delete existing.error;
  }
  planSteps(state, planned);

  delete state.error;
  delete state.finishedAt;
  state.pid = process.pid;
  setStatus(state, 'running');
}
