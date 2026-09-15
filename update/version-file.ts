import { rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * Rewrites the `version` field of `thei.config.json` in place, atomically.
 *
 * This is the human-readable record of which release the content directory
 * belongs to; the migration ledger inside the database is the authoritative
 * one. Returns the full config object as written.
 */
export async function writeInstalledVersion(
  configPath: string,
  version: string,
  currentConfig: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const config = { ...currentConfig, version };
  const temp = `${configPath}.${randomUUID()}.tmp`;

  try {
    await writeFile(temp, JSON.stringify(config, null, 2), 'utf8');
    await rename(temp, configPath);
  } finally {
    await rm(temp, { force: true });
  }

  return config;
}
