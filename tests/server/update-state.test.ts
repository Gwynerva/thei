import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendLog,
  clearUpdateState,
  createUpdateState,
  isStaleRun,
  readUpdateState,
  setPhase,
  writeUpdateState,
} from '../../update/state';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-update-state-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('update state', () => {
  it('reads back what it wrote, creating .thei as needed', async () => {
    const state = createUpdateState('0.1.0', '0.2.0');
    appendLog(state, 'starting');
    await writeUpdateState(directory, state);

    const loaded = await readUpdateState(directory);
    expect(loaded?.fromVersion).toBe('0.1.0');
    expect(loaded?.toVersion).toBe('0.2.0');
    expect(loaded?.log).toEqual(['starting']);
    expect(loaded?.pid).toBe(process.pid);
  });

  it('reports nothing when no run was ever recorded', async () => {
    expect(await readUpdateState(directory)).toBeUndefined();
  });

  it('survives concurrent writes', async () => {
    const state = createUpdateState('0.1.0', '0.2.0');

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        writeUpdateState(directory, appendLog(state, `line ${index}`)),
      ),
    );

    const loaded = await readUpdateState(directory);
    expect(loaded?.log).toHaveLength(20);
  });

  it('stamps a finish time when the run ends', async () => {
    const state = createUpdateState('0.1.0', '0.2.0');
    expect(state.finishedAt).toBeUndefined();

    setPhase(state, 'building');
    expect(state.finishedAt).toBeUndefined();

    setPhase(state, 'done');
    expect(state.finishedAt).toBeGreaterThan(0);
  });

  it('caps the log so it cannot grow without bound', () => {
    const state = createUpdateState('0.1.0', '0.2.0');
    for (let index = 0; index < 1000; index++) {
      appendLog(state, `line ${index}`);
    }

    expect(state.log.length).toBeLessThanOrEqual(200);
    expect(state.log.at(-1)).toBe('line 999');
  });

  it('treats a run owned by a dead process as stale', () => {
    const state = createUpdateState('0.1.0', '0.2.0');
    setPhase(state, 'building');

    // Our own run is never stale, however long it takes.
    expect(isStaleRun(state)).toBe(false);

    // A pid that cannot exist stands in for a process that is gone.
    state.pid = 2 ** 30;
    expect(isStaleRun(state)).toBe(true);

    // Exiting is how an update ends, so this one is waiting, not stale.
    setPhase(state, 'restarting');
    expect(isStaleRun(state)).toBe(false);
  });

  it('clears the recorded run', async () => {
    await writeUpdateState(directory, createUpdateState('0.1.0', '0.2.0'));
    await clearUpdateState(directory);
    expect(await readUpdateState(directory)).toBeUndefined();
  });
});
