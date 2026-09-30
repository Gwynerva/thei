/**
 * Everything the update system needs to know about how this instance is run.
 *
 * Most of it comes from the systemd unit the installer writes, so a
 * development checkout is automatically recognised as unmanaged and never
 * tries to update or restart itself.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const defaultRepositoryUrl = 'https://github.com/Gwynerva/thei.git';

/** True when a supervisor will restart the process after it exits. */
export function isManaged(): boolean {
  return process.env.THEI_MANAGED === 'systemd';
}

/** Absolute path to the Bun binary, as pinned by the unit file. */
export function bunPath(): string {
  return process.env.THEI_BUN || 'bun';
}

export function repositoryUrl(): string {
  return process.env.THEI_REPOSITORY || defaultRepositoryUrl;
}

/**
 * What `bun install` needs to compile a native addon without the network.
 *
 * better-sqlite3 downloads a prebuilt binary from GitHub and compiles itself
 * with node-gyp when it cannot. node-gyp would then download Node's headers
 * as well; the Node that runs the site ships them beside itself, and they are
 * the ones the addon has to match. `node` is the path of that Node, the
 * process running this code.
 */
export function nativeBuildEnv(node = process.execPath): NodeJS.ProcessEnv {
  const prefix = dirname(dirname(node));
  return existsSync(join(prefix, 'include', 'node', 'node.h'))
    ? { npm_config_nodedir: prefix }
    : {};
}

/**
 * Runs every phase but stops short of replacing the build and exiting, so the
 * flow can be exercised on a development machine.
 */
export function isDryRun(): boolean {
  return process.env.THEI_UPDATE_DRY_RUN === '1';
}

/**
 * Turns a repository URL into a package specifier Bun can install from.
 * GitHub gets its short form; anything else (including the `file://` remotes
 * used in tests) goes through `git+`.
 */
export function dependencySpecifier(repository: string, tag: string): string {
  const github =
    /^(?:https?:\/\/|git@)github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(
      repository,
    );

  if (github) return `github:${github[1]}/${github[2]}#${tag}`;

  const base = repository.startsWith('git+') ? repository : `git+${repository}`;
  return `${base}#${tag}`;
}
