import { spawn } from 'node:child_process';

export interface ExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Milliseconds before the command is killed. */
  timeout?: number;
  onLine?: (line: string) => void;
  /**
   * Hand lines to `onLine` exactly as printed, without stripping colour codes
   * or shortening them — for output that is a protocol rather than a log.
   */
  rawLines?: boolean;
}

export interface ExecResult {
  code: number;
  output: string;
}

// eslint-disable-next-line no-control-regex
const ansiPattern = /\[[0-9;]*[A-Za-z]/g;
const maxLineLength = 300;

/** Build tools write colour codes and very long lines; the panel wants neither. */
export function cleanLine(line: string): string {
  const clean = line.replace(ansiPattern, '').trimEnd();
  return clean.length > maxLineLength
    ? `${clean.slice(0, maxLineLength)}…`
    : clean;
}

export class ExecError extends Error {
  readonly result: ExecResult;

  constructor(message: string, result: ExecResult) {
    super(message);
    this.name = 'ExecError';
    this.result = result;
  }
}

/**
 * Runs a command, streaming its output line by line. Resolves only on exit
 * code 0; anything else throws with the captured output attached.
 */
export function exec(
  command: string,
  args: string[],
  options: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true,
    });

    let output = '';
    let pending = '';

    function emit(line: string) {
      const text = options.rawLines ? line.trimEnd() : cleanLine(line);
      if (text.trim()) options.onLine?.(text);
    }
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;

    function consume(chunk: string) {
      output += chunk;
      pending += chunk;

      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';

      for (const line of lines) emit(line);
    }

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', consume);
    child.stderr?.on('data', consume);

    if (options.timeout) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, options.timeout);
    }

    function finish() {
      if (timer) clearTimeout(timer);
      emit(pending);
      pending = '';
    }

    child.on('error', (error) => {
      finish();
      reject(
        new ExecError(`Failed to run ${command}: ${error.message}`, {
          code: -1,
          output,
        }),
      );
    });

    child.on('close', (code) => {
      finish();

      const result = { code: code ?? -1, output };

      if (timedOut) {
        reject(
          new ExecError(
            `${command} timed out after ${options.timeout}ms`,
            result,
          ),
        );
        return;
      }

      if (result.code !== 0) {
        reject(
          new ExecError(`${command} exited with code ${result.code}`, result),
        );
        return;
      }

      resolve(result);
    });
  });
}
