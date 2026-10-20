// Small things every command of the lab needs. Each part keeps its own
// helpers in its own folder; this file stays this small.
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createConnection } from 'node:net';
import { dirname } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';

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

/**
 * Whether a process of that number runs. Only that: after a restart the
 * system may give the number to another process, so whatever is about to
 * be stopped is recognised by more than its number (`site/server.ts`).
 */
export function alive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** FNV-1a of a text: a small hash that is the same on every run. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** The sha256 of a file, read as a stream. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** A JSON file, or the fallback when there is none. */
export function readJsonIf<T>(path: string, fallback: T): T {
  return existsSync(path) ? readJson<T>(path) : fallback;
}

/**
 * Writes a JSON file, its folder made first. `atomic` writes it beside and
 * renames it into place, so a reader never meets half of it.
 */
export function writeJson(
  path: string,
  value: unknown,
  options: { atomic?: boolean } = {},
) {
  mkdirSync(dirname(path), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (!options.atomic) return writeFileSync(path, text);
  const work = `${path}.tmp-${process.pid}`;
  writeFileSync(work, text);
  renameSync(work, path);
}
