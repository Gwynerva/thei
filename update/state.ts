import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { isRunningPhase, type UpdatePhase, type UpdateState } from './types';

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
): UpdateState {
  return {
    phase: 'preparing',
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

export function setPhase(state: UpdateState, phase: UpdatePhase): UpdateState {
  state.phase = phase;
  if (!isRunningPhase(phase)) state.finishedAt = Date.now();
  return state;
}

/**
 * A run recorded by a process that is no longer alive never finished — the
 * server was killed mid-update. It must not block a new attempt.
 */
export function isStaleRun(state: UpdateState): boolean {
  if (!isRunningPhase(state.phase)) return false;
  // `restarting` is the expected way a run ends: the process exits on purpose.
  if (state.phase === 'restarting') return false;
  if (state.pid === process.pid) return false;

  try {
    process.kill(state.pid, 0);
    return false;
  } catch {
    return true;
  }
}
