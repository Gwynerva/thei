import type { UpdateState } from '../../update/types';

/**
 * Whether the site is open, closed while an update finishes its work, or
 * closed because that work stopped.
 */
export type UpdateSite = 'open' | 'updating' | 'failed';

/** Why the site stays closed. */
export interface UpdateFailure {
  reason: 'migration-failed' | 'task-failed' | 'downgrade' | 'error';
  message: string;
  /** The update step that failed, `migration:<id>` or `task:<id>`. */
  stepId?: string;
  fromVersion?: string;
  toVersion?: string;
}

/** A run as the update screen sees it: no build log, no process id. */
export type UpdateRunView = Omit<UpdateState, 'log' | 'pid'>;

/**
 * What `GET /api/update/progress` answers.
 *
 * The update screen of one release polls the server of the next, so this
 * shape is frozen: it may only ever gain optional fields.
 */
export interface UpdateProgress {
  site: UpdateSite;
  /** Version of the engine that answered. */
  version: string;
  /** Whether the request came from a signed-in admin. */
  admin: boolean;
  /**
   * The latest run: to anyone while the site is closed, since the closed site
   * has nothing else to say for itself, and only to an admin once it is open.
   */
  run?: UpdateRunView;
  failure?: UpdateFailure;
  /** Whether the requester may ask for the failed step to be tried again. */
  canRetry?: boolean;
}

/**
 * What the update screen shows:
 *
 * - `progress` — steps are running, before or after the restart;
 * - `offline` — the server does not answer, as it does while restarting;
 * - `done` — the site is open on the new version;
 * - `failed` — the site stays closed until the failed step succeeds;
 * - `failed-open` — the update stopped before the restart and the previous
 *   version still serves the site.
 */
export type UpdateScreenState =
  'progress' | 'offline' | 'done' | 'failed' | 'failed-open';

export function updateScreenState(
  progress: UpdateProgress | undefined,
  offline: boolean,
): UpdateScreenState {
  if (!progress || offline) return 'offline';
  if (progress.site === 'failed') return 'failed';
  if (progress.site === 'updating') return 'progress';
  if (!progress.run || progress.run.status === 'done') return 'done';
  if (progress.run.status === 'failed') return 'failed-open';
  return 'progress';
}
