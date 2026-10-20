// Small things every command of the lab needs. Each part keeps its own
// helpers in its own folder; this file stays this small.
import { createConnection } from 'node:net';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import type { Command } from './types';

/** A command whose part is not built yet. */
export function notBuilt(part: string): Command['run'] {
  return async () => {
    console.error(`Not built yet: this command belongs to the lab's ${part}.`);
    return 2;
  };
}

/** `parseArgs` with the lab's defaults: strict, positionals allowed. */
export function parse<O extends NonNullable<ParseArgsConfig['options']>>(
  args: string[],
  options: O,
) {
  return parseArgs({ args, options, allowPositionals: true, strict: true });
}

/** Whether anything accepts a connection on the port, on either loopback. */
export async function portAnswers(port: number): Promise<boolean> {
  for (const host of ['127.0.0.1', '::1']) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host, port });
      const done = (result: boolean) => {
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(1500, () => done(false));
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
    });
    if (open) return true;
  }
  return false;
}

/** Prints a value as JSON for `--json`, or lines for a person. */
export function output(json: boolean, value: unknown, lines: () => string[]) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else for (const line of lines()) console.log(line);
}
