export const updateRunStatuses = [
  'running',
  'restarting',
  'done',
  'failed',
] as const;

export type UpdateRunStatus = (typeof updateRunStatuses)[number];

export type UpdateStepStatus =
  'pending' | 'running' | 'done' | 'failed' | 'skipped';

/**
 * One line of the update's progress list.
 *
 * `builtin` steps belong to the update pipeline itself, `phase` steps are
 * scripted actions a release ships in `update/phases/`, and `migration` steps
 * are applied on boot. Titles are stored already resolved to a language: the
 * panel that reads them may be older than the release that defined them.
 */
export interface UpdateStep {
  id: string;
  kind: 'builtin' | 'phase' | 'migration';
  title: string;
  description?: string;
  status: UpdateStepStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

export interface UpdateState {
  status: UpdateRunStatus;
  steps: UpdateStep[];
  fromVersion: string;
  toVersion: string;
  startedAt: number;
  finishedAt?: number;
  /** Process that owns the run, used to detect a run orphaned by a crash. */
  pid: number;
  error?: string;
  log: string[];
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  checkedAt?: number;
  checkError?: string;
  /**
   * Whether this instance is supervised by something that will bring it back
   * after it exits. Updating and restarting are only offered when it is.
   */
  managed: boolean;
  running: boolean;
  state?: UpdateState;
}

export function isRunningStatus(status: UpdateRunStatus): boolean {
  return status === 'running' || status === 'restarting';
}
