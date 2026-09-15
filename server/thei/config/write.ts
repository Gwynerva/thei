import { rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTheiConfig, type TheiConfig } from './index';

/** Writes are serialized so two callers cannot interleave read and write. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Persist `thei.config.json` and adopt it as the running config.
 *
 * Written to a temporary file and renamed into place: a crash halfway through
 * would otherwise leave the instance with a config it cannot parse, and boot
 * reads this file before anything else.
 */
export async function writeTheiConfig(config: TheiConfig): Promise<void> {
  const save = queue.then(async () => {
    const path = THEI_SERVER.contentPath('thei.config.json');
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(config, null, 2), 'utf8');
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true });
    }
    setTheiConfig(config);
  });
  queue = save.catch(() => {});
  await save;
}
