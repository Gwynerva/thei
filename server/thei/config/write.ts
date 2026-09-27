import { writeConfigFile } from '#layers/thei/update/config-file';
import { setTheiConfig, type TheiConfig } from './index';

/** Writes are serialized so two callers cannot interleave read and write. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Changes the config and adopts the result as the running one.
 *
 * The change is computed inside the write queue, from the config as the
 * previous write left it, so two changes made at once — a settings save and
 * a new backup token — both survive. The file is replaced atomically: boot
 * reads it before anything else.
 */
export async function updateTheiConfig(
  change: (config: TheiConfig) => TheiConfig,
): Promise<void> {
  const save = queue.then(async () => {
    const config = change(THEI_SERVER.config);
    await writeConfigFile(
      THEI_SERVER.contentPath('thei.config.json'),
      config as unknown as Record<string, unknown>,
    );
    setTheiConfig(config);
  });
  queue = save.catch(() => {});
  await save;
}

/** Persists `config` as a whole. */
export async function writeTheiConfig(config: TheiConfig): Promise<void> {
  await updateTheiConfig(() => config);
}
