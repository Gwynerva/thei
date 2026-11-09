import { fileURLToPath } from 'node:url';
import { ensureFfmpeg } from '../../update/ffmpeg/install';
import { resolveFfmpegTools } from '../../update/ffmpeg/tools';

/**
 * The tests run the ffmpeg Thei pins from under the repository, where the
 * dev server keeps the same copy (`update/ffmpeg/`): the first run fetches
 * it, about 150 MB from GitHub. `THEI_FFMPEG` names a build of one's own
 * instead, on a platform without a pinned one.
 *
 * A fetch that fails — offline, or on macOS, which has no pinned build — is
 * said and the run goes on: most tests need no ffmpeg, and those that do
 * fail on their own, saying where they looked.
 */
export async function prepareTestFfmpeg(options: {
  root: string;
  env?: NodeJS.ProcessEnv;
  ensure?: typeof ensureFfmpeg;
  warn?: (message: string) => void;
}): Promise<void> {
  const { root, env = process.env, ensure = ensureFfmpeg } = options;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  if (resolveFfmpegTools({ cwd: root, env }).source !== 'missing') return;
  try {
    await ensure({
      projectPath: root,
      env,
      log: (message) => console.log(message),
      removeOthers: true,
    });
  } catch (error) {
    warn(
      `ffmpeg could not be fetched, so the tests that run it will fail: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export default async function setup(): Promise<void> {
  await prepareTestFfmpeg({
    root: fileURLToPath(new URL('../..', import.meta.url)),
  });
}
