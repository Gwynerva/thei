import { spawn } from 'node:child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

export interface FfmpegRunOptions {
  /** Kills ffmpeg; the run then rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Each chunk ffmpeg writes to stdout; stdout is not read without it. */
  onStdout?: (chunk: Buffer) => void;
  /** Each chunk of ffmpeg's log; stderr is not read without it. */
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
  const { signal, onStdout, onStderr } = options;
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegInstaller.path, args, {
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
    child.on('error', (error) => {
      signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(signal.reason);
      else resolve(code);
    });
  });
}
