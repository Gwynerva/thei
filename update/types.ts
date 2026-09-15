export const updatePhases = [
  'preparing',
  'dependencies',
  'building',
  'swapping',
  'restarting',
  'done',
  'failed',
] as const;

export type UpdatePhase = (typeof updatePhases)[number];

export interface UpdateState {
  phase: UpdatePhase;
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

export function isRunningPhase(phase: UpdatePhase): boolean {
  return phase !== 'done' && phase !== 'failed';
}
