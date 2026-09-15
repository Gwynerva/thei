import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { swapOutput } from './output';
import { bunPath, isDryRun, isManaged } from './environment';
import { exec, ExecError } from './exec';
import {
  backupInstanceManifest,
  renderInstanceManifest,
  templatePath,
  writeInstanceManifest,
} from './instance';
import { checkForUpdate, getCachedCheck, isNewer } from './remote';
import { normalizeVersion } from './semver';
import {
  appendLog,
  createUpdateState,
  isStaleRun,
  readUpdateState,
  setPhase,
  writeUpdateState,
} from './state';
import { isRunningPhase, type UpdateState, type UpdateStatus } from './types';

const installTimeout = 15 * 60 * 1000;
const buildTimeout = 30 * 60 * 1000;
/** Long enough for the HTTP response to reach the browser before we exit. */
const exitDelay = 300;

export interface UpdateRuntime {
  /** The instance directory: where package.json, content/ and .output/ live. */
  projectPath: string;
  /** The installed engine directory, inside the instance's node_modules. */
  theiPath: string;
  currentVersion: string;
  log: (message: string) => void;
}

export class UpdateRefused extends Error {
  readonly code: 'not-managed' | 'already-running' | 'not-available';

  constructor(
    message: string,
    code: 'not-managed' | 'already-running' | 'not-available',
  ) {
    super(message);
    this.name = 'UpdateRefused';
    this.code = code;
  }
}

export async function getUpdateStatus(
  runtime: UpdateRuntime,
  options: { check?: boolean; force?: boolean } = {},
): Promise<UpdateStatus> {
  const check = options.check
    ? await checkForUpdate(runtime.projectPath, { force: options.force })
    : getCachedCheck();

  const state = await resolveState(runtime);

  return {
    currentVersion: runtime.currentVersion,
    latestVersion: check?.latestVersion,
    updateAvailable: Boolean(
      check?.latestVersion &&
      isNewer(check.latestVersion, runtime.currentVersion),
    ),
    checkedAt: check?.checkedAt,
    checkError: check?.error,
    managed: isManaged(),
    running: Boolean(state && isRunningPhase(state.phase)),
    state,
  };
}

/**
 * Settles the state left behind by a previous run. After a restart the process
 * that wrote the state is gone, so the outcome is decided here by comparing the
 * version now running against the version the run was aiming for.
 */
async function resolveState(
  runtime: UpdateRuntime,
): Promise<UpdateState | undefined> {
  const state = await readUpdateState(runtime.projectPath);
  if (!state || !isRunningPhase(state.phase)) return state;

  if (state.phase === 'restarting' && state.pid !== process.pid) {
    const reached =
      normalizeVersion(runtime.currentVersion) ===
      normalizeVersion(state.toVersion);

    appendLog(
      state,
      reached
        ? `Now running Thei ${runtime.currentVersion}.`
        : `Restarted, but still running Thei ${runtime.currentVersion}.`,
    );

    if (!reached) {
      state.error = `The update did not take effect: expected ${state.toVersion}.`;
    }

    setPhase(state, reached ? 'done' : 'failed');
    await writeUpdateState(runtime.projectPath, state);
    return state;
  }

  if (isStaleRun(state)) {
    state.error = 'The server stopped while updating.';
    appendLog(state, state.error);
    setPhase(state, 'failed');
    await writeUpdateState(runtime.projectPath, state);
  }

  return state;
}

/**
 * Updates the instance to `tag` and exits so the supervisor restarts it.
 *
 * Resolves as soon as the run is under way — the caller is an HTTP handler and
 * must not wait for a build. Progress is reported through the state file.
 */
export async function startUpdate(
  runtime: UpdateRuntime,
  tag: string,
): Promise<UpdateState> {
  if (!isManaged()) {
    throw new UpdateRefused(
      'This instance is not managed by a service supervisor, so it cannot ' +
        'restart itself.',
      'not-managed',
    );
  }

  const existing = await resolveState(runtime);
  if (existing && isRunningPhase(existing.phase)) {
    throw new UpdateRefused('An update is already running.', 'already-running');
  }

  const state = createUpdateState(
    runtime.currentVersion,
    normalizeVersion(tag),
  );
  appendLog(state, `Updating from ${runtime.currentVersion} to ${tag}.`);
  await writeUpdateState(runtime.projectPath, state);

  void run(runtime, tag, state);

  return state;
}

async function run(
  runtime: UpdateRuntime,
  tag: string,
  state: UpdateState,
): Promise<void> {
  const { projectPath } = runtime;

  async function report(message: string) {
    runtime.log(message);
    appendLog(state, message);
    await writeUpdateState(projectPath, state);
  }

  async function phase(next: UpdateState['phase']) {
    setPhase(state, next);
    await writeUpdateState(projectPath, state);
  }

  async function install(label: string) {
    await report(label);
    await exec(bunPath(), ['install'], {
      cwd: projectPath,
      timeout: installTimeout,
      onLine: (line) => appendLog(state, line),
    });
    await writeUpdateState(projectPath, state);
  }

  try {
    await backupInstanceManifest(projectPath);
    await report('Saved the current manifest as package.json.prev.');

    const template = await readFile(templatePath(runtime.theiPath), 'utf8');
    await writeInstanceManifest(
      projectPath,
      renderInstanceManifest(template, tag),
    );

    await phase('dependencies');
    await install(`Installing Thei ${tag}...`);

    // The new engine ships its own manifest template. Re-render from it so a
    // release can change peer versions or trusted dependencies on its own.
    const nextTemplate = await readFile(
      templatePath(join(projectPath, 'node_modules', 'thei')),
      'utf8',
    );

    if (nextTemplate !== template) {
      await report('The new version changed the instance manifest.');
      await writeInstanceManifest(
        projectPath,
        renderInstanceManifest(nextTemplate, tag),
      );
      await install('Reinstalling with the updated manifest...');
    }

    await phase('building');
    await report('Building the site...');

    const stagingDir = join(projectPath, '.output.next');
    await rm(stagingDir, { recursive: true, force: true });

    await exec(bunPath(), ['run', 'build'], {
      cwd: projectPath,
      timeout: buildTimeout,
      env: { THEI_BUILD_DIR: stagingDir },
      onLine: (line) => appendLog(state, line),
    });

    if (isDryRun()) {
      await rm(stagingDir, { recursive: true, force: true });
      await report('Dry run: stopping before the build is swapped in.');
      await phase('done');
      return;
    }

    await phase('swapping');
    const { retargeted } = await swapOutput(projectPath, stagingDir);
    await report(
      retargeted
        ? `New build is in place (${retargeted} link(s) repointed).`
        : 'New build is in place.',
    );

    await phase('restarting');
    await report('Restarting...');

    setTimeout(() => process.exit(0), exitDelay).unref();
  } catch (error) {
    const message =
      error instanceof ExecError
        ? `${error.message}\n${error.result.output.trim().split(/\r?\n/).slice(-20).join('\n')}`
        : error instanceof Error
          ? error.message
          : String(error);

    state.error = message;
    appendLog(state, message);
    setPhase(state, 'failed');
    await writeUpdateState(projectPath, state);
    runtime.log(`Update failed: ${message}`);
  }
}

/** Exits so the supervisor starts a fresh process. */
export function restartServer(): void {
  if (!isManaged()) {
    throw new UpdateRefused(
      'This instance is not managed by a service supervisor, so it cannot ' +
        'restart itself.',
      'not-managed',
    );
  }

  setTimeout(() => process.exit(0), exitDelay).unref();
}
