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

/**
 * What a fresh installation of the site keeps of `.thei/`.
 *
 * Everything else there is scratch or derived — temp files, the search
 * index, backup state — and goes with the content it described. `bin/` holds
 * the ffmpeg the installer or an update fetched (`update/ffmpeg/`), which has
 * nothing to do with the content and costs a 150 MB download to put back.
 */
const THEI_DIR_KEPT_ON_INSTALL = new Set(['bin']);

/** Empties `.thei/` for a fresh installation, all but what outlives one. */
export async function wipeTheiDir(): Promise<void> {
  const directory = join(theiProjectPath(), '.thei');
  for (const name of await readdir(directory).catch(() => [])) {
    if (THEI_DIR_KEPT_ON_INSTALL.has(name)) continue;
    await rm(join(directory, name), { recursive: true, force: true });
  }
}

function theiProjectPath(): string {
  return theiProjectPathIfAny() ?? tmpdir();
}

/** The instance directory, where there is a server; nothing in a bare test. */
export function theiProjectPathIfAny(): string | undefined {
  const server = (
    globalThis as { THEI_SERVER?: { projectPath?: () => string } }
  ).THEI_SERVER;
  return server?.projectPath?.();
}
