/**
 * Puts the pinned ffmpeg in place: download, check, unpack, try.
 *
 * Safe to run again: with the right version already there and answering,
 * it does nothing, and with `THEI_FFMPEG` naming the operator's own ffmpeg
 * it only asks that one whether it runs. A failed attempt leaves nothing
 * behind but files in `.thei/tmp`, which the temp sweep takes. Nothing here
 * imports from the server: the installer and the update phase run it under
 * Bun, before there is a site.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { chmod, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { exec, ExecError } from '../exec';
import { compareVersions, isVersion } from '../semver';
import {
  FFMPEG_VERSION,
  executableName,
  ffmpegBuildFor,
  ffmpegToolsDir,
  ffmpegToolsIn,
  ffmpegVersionsDir,
  resolveFfmpegTools,
  type FfmpegBuild,
  type FfmpegTools,
} from './tools';

export interface EnsureFfmpegOptions {
  /** The instance directory, whose `.thei/bin/` gets the tools. */
  projectPath: string;
  log?: (message: string) => void;
  /** Stands in for the network in tests. */
  fetch?: typeof fetch;
  /** The build to install; the platform's pinned one by default. */
  build?: FfmpegBuild;
  platform?: NodeJS.Platform;
  /** Seconds between tries when GitHub fails to answer; shorter in tests. */
  retryDelaySeconds?: number;
  /**
   * Also remove the older versions from `.thei/bin/ffmpeg/`. Off by default:
   * the update phase runs while the previous build still serves the site with
   * its own version, which the new build sweeps when it boots
   * (`removeOtherFfmpegVersions`).
   */
  removeOthers?: boolean;
  /**
   * Where `THEI_FFMPEG` and `THEI_FFPROBE` are read: the process's own
   * environment by default.
   */
  env?: NodeJS.ProcessEnv;
  /** The `xz` asked before a `.tar.xz` is fetched; stands in for the system's in tests. */
  xz?: string;
}

export interface EnsureFfmpegResult extends FfmpegTools {
  /** False when the tools were already there and answering. */
  installed: boolean;
  /** The first line ffmpeg prints about itself. */
  version: string;
}

export class FfmpegInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FfmpegInstallError';
  }
}

/** How long a tool has to say its version: one that hangs is broken. */
const TOOL_ANSWER_TIMEOUT_MS = 60_000;
/** How long the two executables take to come out of the archive, at most. */
const UNPACK_TIMEOUT_MS = 10 * 60_000;

export async function ensureFfmpeg(
  options: EnsureFfmpegOptions,
): Promise<EnsureFfmpegResult> {
  const log = options.log ?? (() => {});
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  // The operator's own ffmpeg is the one the site runs (`resolveFfmpegTools`):
  // it is asked whether it runs, and nothing is fetched beside it.
  if (env.THEI_FFMPEG) {
    return await checkOwnFfmpeg(resolveFfmpegTools({ env, platform }), log);
  }

  const build = options.build ?? ffmpegBuildFor(platform);
  if (!build) {
    throw new FfmpegInstallError(
      `No pinned ffmpeg build for ${platform}-${process.arch}. ` +
        'Install ffmpeg yourself and point THEI_FFMPEG at it.',
    );
  }

  const directory = ffmpegToolsDir(options.projectPath);
  const tools = ffmpegToolsIn(directory, platform);
  if (existsSync(tools.ffmpeg) && existsSync(tools.ffprobe)) {
    const version = await toolVersion(tools.ffmpeg).catch(() => undefined);
    if (version) {
      log(`ffmpeg ${FFMPEG_VERSION} is in place: ${version}`);
      return { ...tools, installed: false, version };
    }
    log(`The ffmpeg at ${directory} does not run; fetching it again.`);
  }

  if (platform !== 'win32' && build.archive.endsWith('.tar.xz')) {
    await requireXz(options.xz ?? 'xz');
  }

  const tempDir = join(options.projectPath, '.thei', 'tmp');
  await mkdir(tempDir, { recursive: true });
  const archive = join(tempDir, `ffmpeg-${randomUUID()}-${build.archive}`);
  const unpacked = `${directory}.partial-${randomUUID()}`;
  const replaced = `${directory}.replaced-${randomUUID()}`;
  try {
    log(`Downloading ${build.archive} from GitHub (about 150 MB)…`);
    await download(build, archive, options.fetch ?? fetch, {
      log,
      retryDelaySeconds: options.retryDelaySeconds ?? 5,
    });
    log('Checksum matches the pinned build.');

    await mkdir(unpacked, { recursive: true });
    await extract(build, archive, unpacked, platform);
    const made = ffmpegToolsIn(unpacked, platform);
    for (const tool of [made.ffmpeg, made.ffprobe]) {
      if (!existsSync(tool)) {
        throw new FfmpegInstallError(
          `The archive did not yield ${tool}; the pinned build has changed shape.`,
        );
      }
      if (platform !== 'win32') await chmod(tool, 0o755);
    }
    const version = await toolVersion(made.ffmpeg).catch((error: unknown) => {
      throw new FfmpegInstallError(
        `The unpacked ffmpeg does not run here: ${errorMessage(error)}`,
      );
    });

    // A broken copy of the same version steps aside first, so the directory
    // is never empty in between: a site repaired while serving goes on.
    await mkdir(ffmpegVersionsDir(options.projectPath), { recursive: true });
    if (existsSync(directory)) await rename(directory, replaced);
    await rename(unpacked, directory);
    await rm(replaced, { recursive: true, force: true }).catch(() => {});
    if (options.removeOthers) {
      await removeOtherFfmpegVersions(options.projectPath, log);
    }
    log(`Installed ffmpeg ${FFMPEG_VERSION}: ${version}`);
    return { ...tools, installed: true, version };
  } finally {
    await rm(archive, { force: true }).catch(() => {});
    await rm(unpacked, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The operator's ffmpeg and ffprobe, asked whether they run. They stand in
 * for the pinned build on a platform that has none, so an update must not
 * try to fetch one there; tools that do not run stop it all the same.
 */
async function checkOwnFfmpeg(
  tools: FfmpegTools,
  log: (message: string) => void,
): Promise<EnsureFfmpegResult> {
  const answers: string[] = [];
  for (const tool of [tools.ffmpeg, tools.ffprobe]) {
    answers.push(
      await toolVersion(tool).catch((error: unknown) => {
        throw new FfmpegInstallError(
          `THEI_FFMPEG names an ffmpeg of your own, but ${tool} does not run: ` +
            `${errorMessage(error)}. Point THEI_FFMPEG (and THEI_FFPROBE) ` +
            'at tools that run, or unset them to use the pinned build.',
        );
      }),
    );
  }
  log(
    `THEI_FFMPEG names an ffmpeg of your own; nothing is fetched: ${answers[0]}`,
  );
  return {
    ffmpeg: tools.ffmpeg,
    ffprobe: tools.ffprobe,
    installed: false,
    version: answers[0]!,
  };
}

/**
 * The system's tar unpacks a `.tar.xz` by handing it to `xz`. A server the
 * installer set up since 0.0.8 has it (`xz-utils`); one an older installer
 * set up may not, and hears so before 150 MB are fetched for nothing.
 */
async function requireXz(xz: string): Promise<void> {
  try {
    await exec(xz, ['--version'], {
      cwd: process.cwd(),
      timeout: TOOL_ANSWER_TIMEOUT_MS,
    });
  } catch (error) {
    throw new FfmpegInstallError(
      `The ffmpeg build comes as a .tar.xz, which this server cannot unpack ` +
        `without xz (${errorMessage(error)}). Install it as root with ` +
        '`apt-get install xz-utils` and try again; nothing was downloaded.',
    );
  }
}

/** How often GitHub is asked before the install gives up on it. */
const DOWNLOAD_TRIES = 4;

/**
 * Streams the archive to disk, hashing it on the way; a mismatch is fatal.
 * GitHub's release downloads answer 5xx now and then, or break off partway
 * through the body, and an update or an install is too long a thing to fail
 * on one of those: the download is made again a few times, a pause between
 * them, before the step gives up. A whole body that does not match the pin is
 * not asked for again: that is not the build that was pinned.
 */
async function download(
  build: FfmpegBuild,
  destination: string,
  fetchImpl: typeof fetch,
  options: { log: (message: string) => void; retryDelaySeconds: number },
): Promise<void> {
  let failure = '';
  for (let attempt = 1; attempt <= DOWNLOAD_TRIES; attempt++) {
    if (attempt > 1) {
      options.log(
        `${failure}; trying again in ${options.retryDelaySeconds} s (${attempt} of ${DOWNLOAD_TRIES})…`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, options.retryDelaySeconds * 1000),
      );
    }
    let response: Response;
    try {
      response = await fetchImpl(build.url, { redirect: 'follow' });
    } catch (error) {
      failure = `Could not reach github.com: ${errorMessage(error)}`;
      continue;
    }
    if (!response.ok || !response.body) {
      failure = `GitHub answered ${response.status}`;
      // A 4xx will not change by asking again: the build is not where it was.
      if (response.status < 500) break;
      continue;
    }
    let digest: string;
    try {
      digest = await saveHashed(response.body, destination);
    } catch (error) {
      failure = `The download from github.com broke off: ${errorMessage(error)}`;
      continue;
    }
    if (digest !== build.sha256) {
      throw new FfmpegInstallError(
        `${build.archive} does not match its pinned SHA-256 ` +
          `(got ${digest}, expected ${build.sha256}); nothing was installed.`,
      );
    }
    return;
  }
  throw new FfmpegInstallError(
    `${failure} for ${build.url}. The server needs access to github.com for this step.`,
  );
}

/** Writes a body to disk and answers its SHA-256; rejects when it breaks off. */
async function saveHashed(
  body: NonNullable<Response['body']>,
  destination: string,
): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(
    Readable.fromWeb(body as ReadableStream),
    async function* (chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        hash.update(chunk);
        yield chunk;
      }
    },
    createWriteStream(destination),
  );
  return hash.digest('hex');
}

/**
 * Unpacks only the two executables. The system `tar` reads both a tar.xz
 * and, as bsdtar on Windows, a zip; on Linux it needs `xz-utils`, which
 * `requireXz` asks for first. Git for Windows puts a GNU tar on the PATH that
 * cannot read a zip, so Windows uses the one in System32 by its full path.
 */
async function extract(
  build: FfmpegBuild,
  archive: string,
  into: string,
  platform: NodeJS.Platform,
): Promise<void> {
  const members = (['ffmpeg', 'ffprobe'] as const).map(
    (tool) => `${build.root}/bin/${executableName(tool, platform)}`,
  );
  const tar =
    platform === 'win32'
      ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
  try {
    await exec(
      tar,
      ['-xf', archive, '-C', into, '--strip-components=2', ...members],
      { cwd: process.cwd(), timeout: UNPACK_TIMEOUT_MS },
    );
  } catch (error) {
    const said =
      error instanceof ExecError ? error.result.output.trim() : undefined;
    throw new FfmpegInstallError(
      `Could not unpack ${build.archive} with ${tar}: ${said || errorMessage(error)}` +
        (platform === 'linux' ? ' (is xz-utils installed?)' : ''),
    );
  }
}

/**
 * How long a directory an install unpacks into (`*.partial-*`), or a broken
 * copy it set aside (`*.replaced-*`), is left to the install that made it.
 * The dev server and the tests may fetch side by side, and the first to
 * finish must not take the other's half-unpacked copy from under it.
 */
const UNFINISHED_GRACE_MS = 60 * 60 * 1000;

/**
 * Removes the versions in `.thei/bin/ffmpeg/` older than the pinned one, and
 * what interrupted installs left there an hour ago or more. Run by the build
 * that uses the pinned version, never by an update while an older build still
 * serves with its own — and only once the pinned version is in place: a
 * build that boots without its own ffmpeg, say one a phase failed to fetch,
 * keeps whatever still works. A newer version is never touched: it is the
 * one of a build `rollback.sh` set aside, which may come back.
 */
export async function removeOtherFfmpegVersions(
  projectPath: string,
  log: (message: string) => void = () => {},
): Promise<void> {
  if (!(await pinnedToolsInPlace(projectPath))) return;
  const parent = ffmpegVersionsDir(projectPath);
  for (const name of await readdir(parent).catch(() => [])) {
    const path = join(parent, name);
    if (!(await isSweepable(path, name))) continue;
    await rm(path, { recursive: true, force: true });
    log(`Removed ffmpeg ${name}.`);
  }
}

async function pinnedToolsInPlace(projectPath: string): Promise<boolean> {
  const tools = ffmpegToolsIn(ffmpegToolsDir(projectPath));
  for (const tool of [tools.ffmpeg, tools.ffprobe]) {
    const found = await stat(tool).catch(() => undefined);
    if (!found?.isFile() || found.size === 0) return false;
  }
  return true;
}

async function isSweepable(path: string, name: string): Promise<boolean> {
  if (/\.(partial|replaced)-/.test(name)) {
    const found = await stat(path).catch(() => undefined);
    return Boolean(found && Date.now() - found.mtimeMs >= UNFINISHED_GRACE_MS);
  }
  return isVersion(name) && compareVersions(name, FFMPEG_VERSION) < 0;
}

/** The first line of `ffmpeg -version`; rejects when it does not run. */
export async function toolVersion(
  executable: string,
  options: { timeout?: number } = {},
): Promise<string> {
  let output: string;
  try {
    ({ output } = await exec(executable, ['-version'], {
      cwd: process.cwd(),
      timeout: options.timeout ?? TOOL_ANSWER_TIMEOUT_MS,
    }));
  } catch (error) {
    const said =
      error instanceof ExecError
        ? error.result.output.trim().split(/\r?\n/).pop()
        : undefined;
    throw new Error(
      said ? `${errorMessage(error)}: ${said}` : errorMessage(error),
    );
  }
  const line = output.split(/\r?\n/)[0]?.trim();
  if (!line) throw new Error(`${executable} printed nothing`);
  return line;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
