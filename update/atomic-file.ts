import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

/**
 * Replaces a file in one step: written beside it and renamed into place, so a
 * crash never leaves half a file for the next reader.
 */
export async function writeFileAtomically(
  path: string,
  contents: string,
): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temp, contents, 'utf8');
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
