import type { UpdateText } from '../text';

export interface UpdateTaskContext {
  /** Goes to the update's log, and the server's. */
  log: (message: string) => void;
  /**
   * How far along the task is. Shown under the task's step on the update
   * screen, so a task that takes minutes never looks stuck.
   */
  progress: (done: number, total: number) => void | Promise<void>;
}

/**
 * Work a release does over existing content with the new engine's own code.
 *
 * A task is the last kind of update step: it runs on the first boot of the
 * new version, after every migration, while the site is still closed — so it
 * sees the database as this release describes it and may use anything the
 * engine has: the Drizzle schema, the media pipeline, the processing lanes.
 * It may take minutes; the site opens once every task has finished.
 *
 * A task runs once. It is recorded in the migration ledger when it resolves,
 * and a task that throws keeps the site closed until it succeeds, so the
 * release after it may count on its result. Items it cannot deal with one by
 * one — an unreadable file — are skipped and reported, not thrown.
 */
export interface TheiUpdateTask {
  /**
   * Stable, unique identifier, by convention `<version>/<order>-<slug>`. The
   * ledger records it, so it must never change once a release has shipped.
   */
  id: string;
  /** The release this task belongs to. */
  version: string;
  title: UpdateText;
  description?: UpdateText;
  /** Wording for the progress, in the site's language. */
  progress?: (done: number, total: number) => UpdateText;
  /**
   * The work. Import heavy modules inside it: the registry is loaded wherever
   * a database is created, tests included.
   */
  run: (context: UpdateTaskContext) => Promise<void>;
}

export function defineUpdateTask(task: TheiUpdateTask): TheiUpdateTask {
  return task;
}
