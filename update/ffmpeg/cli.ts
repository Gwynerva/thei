/**
 * Fetches the pinned ffmpeg into an instance, or into this repository:
 *
 *   bun node_modules/thei/update/ffmpeg/cli.ts [--project <dir>]
 *
 * `install.sh` runs it after the dependencies are in, `rollback.sh` for the
 * version it puts back, and an operator runs it by hand to repair an
 * instance whose `.thei/bin/` was lost. In the repository the dev server and
 * the tests fetch one copy for themselves when none is there
 * (`scripts/dev-server.ts`, `tests/setup/ffmpeg.ts`). The update pipeline
 * uses the phase `0.0.8/001-ffmpeg` instead, which calls the same function
 * and leaves older versions to the new build's boot. With `THEI_FFMPEG` set
 * it only asks that ffmpeg whether it runs.
 */
import { resolve } from 'node:path';
import { ensureFfmpeg, FfmpegInstallError } from './install';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

ensureFfmpeg({
  projectPath: resolve(argument('project') ?? process.cwd()),
  log: (message) => console.log(message),
  // Nothing else runs here that could still be using an older version.
  removeOthers: true,
}).then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(
      error instanceof FfmpegInstallError ? error.message : String(error),
    );
    process.exit(1);
  },
);
