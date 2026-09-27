import { readFile } from 'node:fs/promises';
import { writeFileAtomically } from './atomic-file';

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
  await writeFileAtomically(path, JSON.stringify(config, null, 2));
}
