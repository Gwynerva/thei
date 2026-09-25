import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  migrationStepId,
  openBootRun,
  type OpenBootRunOptions,
} from '../../update/boot-run';
import {
  createUpdateState,
  finishStep,
  pendingStep,
  readUpdateState,
  setStatus,
  settleSteps,
  startStep,
  writeUpdateState,
} from '../../update/state';
import type { UpdateState } from '../../update/types';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-boot-run-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const migration = {
  id: '0.2.0/001-add-color',
  title: { en: 'Add a color', ru: 'Добавить цвет' },
};
const task = {
  id: '0.2.0/001-previews',
  title: { en: 'Remake previews', ru: 'Пересоздать превью' },
  description: 'Old previews are made again.',
};

function open(overrides: Partial<OpenBootRunOptions> = {}) {
  return openBootRun({
    projectPath: directory,
    currentVersion: '0.2.0',
    installedVersion: '0.1.0',
    languageCode: 'ru',
    migrations: [],
    tasks: [],
    log: () => {},
    ...overrides,
  });
}

/** The state an update leaves behind when it restarts into the new version. */
async function restartingRun(toVersion = '0.2.0'): Promise<UpdateState> {
  const state = createUpdateState('0.1.0', toVersion, [
    pendingStep('build', 'builtin', 'Build'),
    pendingStep('restart', 'builtin', 'Restart'),
  ]);
  finishStep(state, 'build', 'done');
  startStep(state, 'restart');
  // Written by the process that is gone now.
  state.pid = 1;
  setStatus(state, 'restarting');
  await writeUpdateState(directory, state);
  return state;
}

const saved = async () => (await readUpdateState(directory))!;
const statuses = (state: UpdateState) =>
  state.steps.map((step) => `${step.id}:${step.status}`);

describe('boot run', () => {
  it('continues the run that restarted into this version', async () => {
    await restartingRun();

    const run = await open({ migrations: [migration], tasks: [task] });

    expect(run.pending).toBe(true);
    const state = await saved();
    expect(state.status).toBe('running');
    expect(state.pid).toBe(process.pid);
    expect(statuses(state)).toEqual([
      'build:done',
      'restart:done',
      'migration:0.2.0/001-add-color:pending',
      'task:0.2.0/001-previews:pending',
    ]);
    // Titles are recorded in the site's language.
    expect(state.steps[2]!.title).toBe('Добавить цвет');
    expect(state.log).toContain('Now running Thei 0.2.0.');
  });

  it('reports steps as they run and ends the run once the site opens', async () => {
    await restartingRun();
    const run = await open({ migrations: [migration], tasks: [task] });
    const taskStep = 'task:0.2.0/001-previews';

    await run.start(migrationStepId(migration.id));
    await run.done(migrationStepId(migration.id));
    await run.start(taskStep);
    await run.progress(taskStep, '3 из 10 видео');
    expect((await saved()).steps.at(-1)).toMatchObject({
      status: 'running',
      description: '3 из 10 видео',
    });

    await run.done(taskStep);
    await run.finish();

    const state = await saved();
    expect(state.status).toBe('done');
    expect(state.finishedAt).toBeDefined();
    expect(statuses(state).every((line) => line.endsWith(':done'))).toBe(true);
  });

  it('settles a restart with nothing left as done, once the site opens', async () => {
    await restartingRun();
    const run = await open();

    expect(run.pending).toBe(false);
    expect((await saved()).status).toBe('running');

    await run.finish();
    const state = await saved();
    expect(state.status).toBe('done');
    expect(statuses(state)).toEqual(['build:done', 'restart:done']);
  });

  it('fails a restart that did not reach its version', async () => {
    await restartingRun('0.3.0');

    const run = await open();

    expect(run.state).toBeUndefined();
    const state = await saved();
    expect(state.status).toBe('failed');
    expect(state.error).toContain('expected 0.3.0');
    expect(state.steps.at(-1)).toMatchObject({
      id: 'restart',
      status: 'failed',
    });
  });

  it('fails a run whose process stopped before its restart', async () => {
    const state = createUpdateState('0.1.0', '0.3.0', [
      pendingStep('build', 'builtin', 'Build'),
      pendingStep('restart', 'builtin', 'Restart'),
    ]);
    startStep(state, 'build');
    state.pid = 1;
    await writeUpdateState(directory, state);

    await open();

    expect(await saved()).toMatchObject({
      status: 'failed',
      error: 'The server stopped while updating.',
    });
  });

  it('carries on from the failed step when tried again', async () => {
    await restartingRun();
    const first = await open({ migrations: [migration], tasks: [task] });
    const taskStep = 'task:0.2.0/001-previews';
    await first.start(migrationStepId(migration.id));
    await first.done(migrationStepId(migration.id));
    await first.start(taskStep);
    await first.progress(taskStep, '1 из 10 видео');
    await first.fail(taskStep, 'ffmpeg is missing');
    expect((await saved()).status).toBe('failed');

    // The migration is in the ledger now; only the task is left.
    const retry = await open({ tasks: [task] });

    expect(retry.pending).toBe(true);
    const state = await saved();
    expect(state.status).toBe('running');
    expect(state.error).toBeUndefined();
    expect(state.finishedAt).toBeUndefined();
    expect(statuses(state)).toEqual([
      'build:done',
      'restart:done',
      'migration:0.2.0/001-add-color:done',
      'task:0.2.0/001-previews:pending',
    ]);
    expect(state.steps.at(-1)).toMatchObject({
      description: 'Old previews are made again.',
    });
    expect(state.steps.at(-1)!.error).toBeUndefined();
  });

  it('closes a step the process finished but never reported', async () => {
    await restartingRun();
    const first = await open({ migrations: [migration] });
    await first.start(migrationStepId(migration.id));
    // The process stops here; the ledger has the migration anyway.

    await open();

    expect((await saved()).steps.at(-1)).toMatchObject({
      id: migrationStepId(migration.id),
      status: 'done',
    });
  });

  it('opens a run of its own for work nobody started through Updates', async () => {
    const run = await open({ tasks: [task] });

    expect(run.pending).toBe(true);
    const state = await saved();
    expect(state).toMatchObject({
      status: 'running',
      fromVersion: '0.1.0',
      toVersion: '0.2.0',
    });
    expect(statuses(state)).toEqual(['task:0.2.0/001-previews:pending']);
  });

  it('leaves a finished run alone when there is nothing to do', async () => {
    const state = createUpdateState('0.1.0', '0.2.0');
    setStatus(state, 'done');
    settleSteps(state);
    await writeUpdateState(directory, state);

    const run = await open();

    expect(run.pending).toBe(false);
    expect(run.state).toBeUndefined();
    await run.finish();
    expect(await saved()).toEqual(state);
  });

  it('does not take over a run that failed before its restart', async () => {
    // The build broke; the engine was later installed by hand.
    const state = createUpdateState('0.1.0', '0.2.0', [
      pendingStep('build', 'builtin', 'Build'),
      pendingStep('restart', 'builtin', 'Restart'),
    ]);
    finishStep(state, 'build', 'failed');
    setStatus(state, 'failed');
    settleSteps(state);
    await writeUpdateState(directory, state);

    await open({ tasks: [task] });

    const current = await saved();
    expect(current.status).toBe('running');
    expect(statuses(current)).toEqual(['task:0.2.0/001-previews:pending']);
  });
});
