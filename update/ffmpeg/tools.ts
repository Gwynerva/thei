/**
 * The ffmpeg Thei runs: which build it is, where it lives, how it is found.
 *
 * ffmpeg and ffprobe are not npm dependencies. The packages that wrap a
 * binary stop at ffmpeg 6 (2023) or 4 (2018), so Thei takes a current static
 * build from BtbN/FFmpeg-Builds instead — one release, pinned by tag and
 * SHA-256 per platform — and puts the two executables in the instance's own
 * `.thei/bin/ffmpeg/<version>/`. That directory survives a reinstall of
 * `node_modules`, and holds the pinned version — an older one only until
 * the build that pins a newer one boots with it in place.
 *
 * `update/ffmpeg/install.ts` fetches it; `install.sh` and the update phase
 * `0.0.8/001-ffmpeg` call that, and so do the repository's dev server and
 * tests for development. This module only knows what and where, so it can be
 * imported by the server, the update pipeline and the tests alike, with
 * nothing but Node in it.
 *
 * The build is a GPL build, run as a separate process and never linked.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The ffmpeg release the pinned build is of; names the install directory. */
export const FFMPEG_VERSION = '9.0.2';

const RELEASE_TAG = 'autobuild-2026-11-08-12-35';
const BUILD_NAME = 'ffmpeg-n9.0.2-48-gd4070a14ce';
const RELEASE_URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/${RELEASE_TAG}`;

export interface FfmpegBuild {
  /** `<platform>-<arch>`, as Node names them. */
  target: string;
  /** The archive's file name in the release. */
  archive: string;
  url: string;
  /** Of the archive, hex. */
  sha256: string;
  /** The directory inside the archive; the executables are in its `bin/`. */
  root: string;
}

const BUILDS: readonly FfmpegBuild[] = [
  {
    target: 'linux-x64',
    archive: `${BUILD_NAME}-linux64-gpl-9.0.tar.xz`,
    sha256: 'bf5e935a51afb65ddd14bf67104361508bcc7c77026a66d7e193a05a56ab8d77',
  },
  {
    target: 'linux-arm64',
    archive: `${BUILD_NAME}-linuxarm64-gpl-9.0.tar.xz`,
    sha256: '78972a433ec501179670b7a35720819deb31569ac25e9040e9bb6f8a7cfc8306',
  },
  {
    target: 'win32-x64',
    archive: `${BUILD_NAME}-win64-gpl-9.0.zip`,
    sha256: '40608cfdd40b0e7929704059daee4af369f7a9984ea7aa8ee416d78cce2e8aae',
  },
].map((build) => ({
  ...build,
  url: `${RELEASE_URL}/${build.archive}`,
  root: build.archive.replace(/\.(tar\.xz|zip)$/, ''),
}));

export const FFMPEG_BUILDS: readonly FfmpegBuild[] = BUILDS;

/** The pinned build for a platform, or nothing: macOS has none. */
export function ffmpegBuildFor(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): FfmpegBuild | undefined {
  const target = `${platform}-${arch}`;
  return BUILDS.find((build) => build.target === target);
}

export interface FfmpegTools {
  ffmpeg: string;
  ffprobe: string;
}

/** Where an instance keeps the pinned version. */
export function ffmpegToolsDir(projectPath: string): string {
  return join(projectPath, '.thei', 'bin', 'ffmpeg', FFMPEG_VERSION);
}

/** The parent of every version's directory in an instance. */
export function ffmpegVersionsDir(projectPath: string): string {
  return dirname(ffmpegToolsDir(projectPath));
}

export function executableName(
  tool: 'ffmpeg' | 'ffprobe',
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === 'win32' ? `${tool}.exe` : tool;
}

/** The two executables inside a version's directory. */
export function ffmpegToolsIn(
  directory: string,
  platform: NodeJS.Platform = process.platform,
): FfmpegTools {
  return {
    ffmpeg: join(directory, executableName('ffmpeg', platform)),
    ffprobe: join(directory, executableName('ffprobe', platform)),
  };
}

export type FfmpegToolsSource = 'env' | 'instance' | 'cwd' | 'missing';

export interface ResolvedFfmpegTools extends FfmpegTools {
  /** Where they were found; `missing` says where they were expected. */
  source: FfmpegToolsSource;
}

export interface ResolveFfmpegToolsOptions {
  /** The instance directory, when known: the first place looked at. */
  projectPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

/**
 * Finds ffmpeg and ffprobe, in this order:
 *
 * 1. `THEI_FFMPEG` (and `THEI_FFPROBE`, which defaults to the ffprobe beside
 *    it) — the operator's own build, on a platform without a pinned one or
 *    with a distribution's ffmpeg preferred;
 * 2. the instance's `.thei/bin/ffmpeg/<version>/`, which the installer and
 *    the update phase fill;
 * 3. the same directory under the working directory — in development the
 *    repository, where the dev server and the tests put one copy for the
 *    playground, the browser fixture and the lab alike; in an instance the
 *    same place as 2.
 *
 * Found nothing, it answers with the instance's expected paths and
 * `source: 'missing'`, so whatever fails next can say where it looked.
 */
export function resolveFfmpegTools(
  options: ResolveFfmpegToolsOptions = {},
): ResolvedFfmpegTools {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  if (env.THEI_FFMPEG) {
    return {
      ffmpeg: env.THEI_FFMPEG,
      ffprobe:
        env.THEI_FFPROBE ??
        join(dirname(env.THEI_FFMPEG), executableName('ffprobe', platform)),
      source: 'env',
    };
  }
  const places: Array<[FfmpegToolsSource, string | undefined]> = [
    ['instance', options.projectPath],
    ['cwd', options.cwd ?? process.cwd()],
  ];
  for (const [source, base] of places) {
    if (!base) continue;
    const tools = ffmpegToolsIn(ffmpegToolsDir(base), platform);
    if (existsSync(tools.ffmpeg)) return { ...tools, source };
  }
  const expected = ffmpegToolsIn(
    ffmpegToolsDir(options.projectPath ?? options.cwd ?? process.cwd()),
    platform,
  );
  return { ...expected, source: 'missing' };
}

/** What to tell whoever finds no ffmpeg where `resolveFfmpegTools` looked. */
export function missingFfmpegMessage(tools: ResolvedFfmpegTools): string {
  return (
    `ffmpeg is not installed: expected ${tools.ffmpeg}. ` +
    'Run `bun node_modules/thei/update/ffmpeg/cli.ts` in the instance ' +
    'directory to fetch it, or point THEI_FFMPEG at an ffmpeg of your own.'
  );
}
