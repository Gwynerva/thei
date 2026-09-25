import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendLog,
  clearUpdateState,
  createUpdateState,
  finishStep,
  pendingStep,
  planSteps,
  readUpdateState,
  setStatus,
  settleSteps,
  startStep,
  writeUpdateState,
} from '../../update/state';
import { resolveUpdateText } from '../../update/text';

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

  it('stamps a finish time when the run ends', () => {
    const state = createUpdateState('0.1.0', '0.2.0');
    expect(state.finishedAt).toBeUndefined();

    setStatus(state, 'restarting');
    expect(state.finishedAt).toBeUndefined();

    setStatus(state, 'done');
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

  it('clears the recorded run', async () => {
    await writeUpdateState(directory, createUpdateState('0.1.0', '0.2.0'));
    await clearUpdateState(directory);
    expect(await readUpdateState(directory)).toBeUndefined();
  });
});

describe('update steps', () => {
  const builtin = () =>
    ['prepare', 'dependencies', 'build'].map((id) =>
      pendingStep(id, 'builtin', id),
    );

  it('plans steps after an anchor without duplicating known ones', () => {
    const state = createUpdateState('0.1.0', '0.2.0', builtin());
    planSteps(
      state,
      [
        pendingStep('phase:a', 'phase', 'A'),
        pendingStep('phase:b', 'phase', 'B'),
      ],
      'dependencies',
    );
    planSteps(state, [pendingStep('phase:a', 'phase', 'A renamed')], 'prepare');

    expect(state.steps.map((step) => step.id)).toEqual([
      'prepare',
      'dependencies',
      'phase:a',
      'phase:b',
      'build',
    ]);
    expect(state.steps[2]!.title).toBe('A renamed');
  });

  it('tracks a step through its lifetime and settles the rest', () => {
    const state = createUpdateState('0.1.0', '0.2.0', builtin());
    startStep(state, 'prepare');
    expect(state.steps[0]).toMatchObject({ status: 'running' });
    finishStep(state, 'prepare', 'done');
    startStep(state, 'dependencies');
    finishStep(state, 'dependencies', 'failed', 'bun install failed');
    setStatus(state, 'failed');
    settleSteps(state);

    expect(state.steps.map((step) => step.status)).toEqual([
      'done',
      'failed',
      'skipped',
    ]);
    expect(state.steps[1]!.error).toBe('bun install failed');
    expect(state.steps[0]!.finishedAt).toBeGreaterThan(0);
  });
});

describe('update text', () => {
  it('uses the site language, then English, then any translation', () => {
    expect(resolveUpdateText('Plain', 'ru')).toBe('Plain');
    expect(resolveUpdateText({ en: 'Hi', ru: 'Привет' }, 'ru')).toBe('Привет');
    expect(resolveUpdateText({ en: 'Hi', ru: 'Привет' }, 'de')).toBe('Hi');
    expect(resolveUpdateText({ ru: 'Привет' }, 'de')).toBe('Привет');
    expect(resolveUpdateText(undefined, 'ru')).toBeUndefined();
  });
});
