import { mkdirSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Scratch directory for media processing.
 *
 * Deliberately not `os.tmpdir()`. On a typical VPS `/tmp` is a tmpfs, so
 * staging an upload or an ffmpeg input there writes it straight back into the
 * RAM that streaming was meant to save, and a large video can fill it outright.
 *
 * It lives beside `content/` rather than inside it: these files are
 * regenerable scratch, and `content/` is the directory operators back up.
 * `.thei/` is already excluded from the Nuxt watcher and wiped on a fresh
 * install.
 *
 * Resolved lazily rather than at import time: the project path comes from a
 * build-time virtual module that does not exist outside a Nuxt build, and this
 * module is imported by code that unit tests load directly.
 */
export function theiTempDir(): string {
  const directory = join(theiProjectPath(), '.thei', 'tmp');
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function theiTempPath(name: string): string {
  return join(theiTempDir(), name);
}

/**
 * Removes scratch left behind by a process that did not get to clean up.
 *
 * A crash or a kill during an upload or a transcode leaves a staged file that
 * nothing else refers to. The sweep only takes files older than an hour, so it
 * can never touch work that is still in flight, however long a transcode runs.
 */
export async function sweepTheiTempDir(): Promise<number> {
  const directory = theiTempDir();
  const cutoff = Date.now() - 60 * 60 * 1000;
  let removed = 0;

  for (const name of await readdir(directory).catch(() => [])) {
    const path = join(directory, name);
    const entry = await stat(path).catch(() => null);
    if (!entry?.isFile() || entry.mtimeMs >= cutoff) continue;
    await rm(path, { force: true }).catch(() => {});
    removed += 1;
  }

  return removed;
}

function theiProjectPath(): string {
  const server = (
    globalThis as { THEI_SERVER?: { projectPath?: () => string } }
  ).THEI_SERVER;
  return server?.projectPath?.() ?? tmpdir();
}
