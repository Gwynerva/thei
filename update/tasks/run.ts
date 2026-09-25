import type { Database } from 'better-sqlite3';
import { recordMigration, taskLedgerId } from '../migrations/ledger';
import { resolveUpdateText } from '../text';
import type { TheiUpdateTask } from './types';

export class TaskError extends Error {
  readonly taskId: string;

  constructor(message: string, taskId: string) {
    super(message);
    this.name = 'TaskError';
    this.taskId = taskId;
  }
}

/** The step a task is shown as. Same as its ledger id. */
export function taskStepId(task: Pick<TheiUpdateTask, 'id'>): string {
  return taskLedgerId(task.id);
}

/** Where a running task reports to: the update's run. */
export interface UpdateTaskReporter {
  start: (stepId: string) => Promise<void>;
  progress: (stepId: string, text: string) => Promise<void>;
  done: (stepId: string) => Promise<void>;
  fail: (stepId: string, message: string) => Promise<void>;
}

export interface RunUpdateTasksOptions {
  languageCode?: string;
  log: (message: string) => void;
  report: UpdateTaskReporter;
}

/**
 * Runs the given tasks one by one, recording each in the ledger once it
 * resolves. Stops at the first task that throws: the tasks after it may count
 * on its result, and the ledger lets the next boot carry on from it.
 */
export async function runUpdateTasks(
  rawDb: Database,
  tasks: TheiUpdateTask[],
  options: RunUpdateTasksOptions,
): Promise<void> {
  const { report, languageCode } = options;

  for (const task of tasks) {
    const stepId = taskStepId(task);
    options.log(
      `Running ${task.id} — ${resolveUpdateText(task.title, languageCode)}`,
    );
    await report.start(stepId);

    try {
      await task.run({
        log: options.log,
        progress: (done, total) =>
          report.progress(
            stepId,
            resolveUpdateText(
              task.progress?.(done, total) ?? `${done} / ${total}`,
              languageCode,
            ),
          ),
      });
      recordMigration(rawDb, stepId, task.version);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await report.fail(stepId, message);
      throw new TaskError(`Task ${task.id} failed: ${message}`, task.id);
    }

    await report.done(stepId);
  }
}
