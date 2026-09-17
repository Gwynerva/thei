import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * `thei.config.json` as update phases and migrations see it: a plain object,
 * read and written without the server's typed config in between. A phase may
 * run against a config the running engine's types no longer describe.
 */
export async function readConfigFile(
  path: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

/** Written beside and renamed into place, so a crash never leaves half a file. */
export async function writeConfigFile(
  path: string,
  config: Record<string, unknown>,
): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(config, null, 2), 'utf8');
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
