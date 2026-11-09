import { spawn } from 'node:child_process';
import { createError } from 'h3';
import {
  missingFfmpegMessage,
  resolveFfmpegTools,
  type ResolvedFfmpegTools,
} from '#layers/thei/update/ffmpeg/tools';
import { theiProjectPathIfAny } from './temp';

/**
 * Where ffmpeg and ffprobe are, looked up on every call: the instance's
 * `.thei/bin/ffmpeg/<version>/`, filled by the installer and the update
 * phase, or whatever `THEI_FFMPEG` names (`update/ffmpeg/tools.ts`). Cheap
 * enough to ask each time, and a test may point the variable elsewhere
 * between two runs.
 */
export function ffmpegTools(): ResolvedFfmpegTools {
  return resolveFfmpegTools({ projectPath: theiProjectPathIfAny() });
}

export interface FfmpegRunOptions {
  /** Kills the process; the run then rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Each chunk written to stdout; stdout is not read without it. */
  onStdout?: (chunk: Buffer) => void;
  /** Each chunk of the log; stderr is not read without it. */
  onStderr?: (chunk: string) => void;
}

/**
 * Runs ffmpeg once and resolves with its exit code. What it prints is handed
 * over as it comes and never gathered here: a decode may pipe an hour of
 * sound through stdout. A process that cannot start rejects, and so does one
 * killed by the signal.
 */
export function runFfmpeg(
  args: readonly string[],
  options: FfmpegRunOptions = {},
): Promise<number | null> {
  return runTool(ffmpegTools().ffmpeg, args, options);
}

/**
 * What a run of a tool that is not there rejects with: a 503 that says where
 * ffmpeg was looked for, marked `ffmpegMissing` so the admin can say it in
 * its own words (`app/composables/upload-draft.ts`).
 */
export function ffmpegMissingError(cause?: unknown) {
  return createError({
    statusCode: 503,
    message: missingFfmpegMessage(ffmpegTools()),
    data: { ffmpegMissing: true },
    cause,
  });
}

/** Runs ffprobe once, the same way. */
export function runFfprobe(
  args: readonly string[],
  options: FfmpegRunOptions = {},
): Promise<number | null> {
  return runTool(ffmpegTools().ffprobe, args, options);
}

function runTool(
  executable: string,
  args: readonly string[],
  options: FfmpegRunOptions,
): Promise<number | null> {
  const { signal, onStdout, onStderr } = options;
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: [
        'ignore',
        onStdout ? 'pipe' : 'ignore',
        onStderr ? 'pipe' : 'ignore',
      ],
    });
    if (onStdout) child.stdout!.on('data', onStdout);
    if (onStderr) {
      child.stderr!.setEncoding('utf8');
      child.stderr!.on('data', onStderr);
    }
    const abort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', (error: NodeJS.ErrnoException) => {
      signal?.removeEventListener('abort', abort);
      reject(error.code === 'ENOENT' ? ffmpegMissingError(error) : error);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(signal.reason);
      else resolve(code);
    });
  });
}
