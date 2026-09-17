import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import {
  isRunningStatus,
  type UpdateRunStatus,
  type UpdateState,
  type UpdateStep,
  type UpdateStepStatus,
} from './types';

/**
 * Kept small: this is a status readout, not a build log archive, and the panel
 * polls the whole thing every second.
 */
const maxLogLines = 200;

export function stateFilePath(projectPath: string): string {
  return join(projectPath, '.thei', 'update-state.json');
}

/** Writes are serialized so concurrent phase updates cannot interleave. */
let queue: Promise<unknown> = Promise.resolve();

export async function readUpdateState(
  projectPath: string,
): Promise<UpdateState | undefined> {
  try {
    const raw = await readFile(stateFilePath(projectPath), 'utf8');
    return JSON.parse(raw) as UpdateState;
  } catch {
    return undefined;
  }
}

export async function writeUpdateState(
  projectPath: string,
  state: UpdateState,
): Promise<void> {
  const write = queue.then(async () => {
    const path = stateFilePath(projectPath);
    const temp = `${path}.${randomUUID()}.tmp`;

    await mkdir(dirname(path), { recursive: true });

    try {
      await writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true });
    }
  });

  queue = write.catch(() => {});
  await write;
}

export async function clearUpdateState(projectPath: string): Promise<void> {
  await rm(stateFilePath(projectPath), { force: true });
}

export function createUpdateState(
  fromVersion: string,
  toVersion: string,
  steps: UpdateStep[] = [],
): UpdateState {
  return {
    status: 'running',
    steps,
    fromVersion,
    toVersion,
    startedAt: Date.now(),
    pid: process.pid,
    log: [],
  };
}

export function appendLog(state: UpdateState, message: string): UpdateState {
  state.log.push(message);
  if (state.log.length > maxLogLines) {
    state.log.splice(0, state.log.length - maxLogLines);
  }
  return state;
}

export function setStatus(
  state: UpdateState,
  status: UpdateRunStatus,
): UpdateState {
  state.status = status;
  if (!isRunningStatus(status)) state.finishedAt = Date.now();
  return state;
}

/** A pending step, ready to be planned into a run. */
export function pendingStep(
  id: string,
  kind: UpdateStep['kind'],
  title: string,
  description?: string,
): UpdateStep {
  return {
    id,
    kind,
    title,
    ...(description ? { description } : {}),
    status: 'pending',
  };
}

/**
 * Inserts steps right after the step `afterId`, or at the end. A step that is
 * already planned keeps its place and only has its texts refreshed.
 */
export function planSteps(
  state: UpdateState,
  steps: UpdateStep[],
  afterId?: string,
): UpdateState {
  const fresh = steps.filter((step) => {
    const existing = state.steps.find((item) => item.id === step.id);
    if (!existing) return true;
    existing.title = step.title;
    existing.description = step.description;
    return false;
  });
  const anchor = afterId
    ? state.steps.findIndex((step) => step.id === afterId)
    : -1;
  const index = anchor === -1 ? state.steps.length : anchor + 1;
  state.steps.splice(index, 0, ...fresh);
  return state;
}

export function startStep(state: UpdateState, id: string): UpdateState {
  const step = state.steps.find((item) => item.id === id);
  if (step) {
    step.status = 'running';
    step.startedAt = Date.now();
    delete step.finishedAt;
    delete step.error;
  }
  return state;
}

export function finishStep(
  state: UpdateState,
  id: string,
  status: Extract<UpdateStepStatus, 'done' | 'failed' | 'skipped'>,
  error?: string,
): UpdateState {
  const step = state.steps.find((item) => item.id === id);
  if (step) {
    step.status = status;
    step.finishedAt = Date.now();
    if (error) step.error = error;
  }
  return state;
}

/** Marks what never got to run once the run as a whole has ended. */
export function settleSteps(state: UpdateState): UpdateState {
  for (const step of state.steps) {
    if (step.status === 'pending') step.status = 'skipped';
    if (step.status === 'running') {
      step.status = state.status === 'failed' ? 'failed' : 'done';
      step.finishedAt = Date.now();
    }
  }
  return state;
}

/**
 * A run recorded by a process that is no longer alive never finished — the
 * server was killed mid-update. It must not block a new attempt.
 */
export function isStaleRun(state: UpdateState): boolean {
  if (!isRunningStatus(state.status)) return false;
  // `restarting` is the expected way a run ends: the process exits on purpose.
  if (state.status === 'restarting') return false;
  if (state.pid === process.pid) return false;

  try {
    process.kill(state.pid, 0);
    return false;
  } catch {
    return true;
  }
}
