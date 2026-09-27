import { existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';

/**
 * Moves a database without a config beside it out of the way, so an
 * installation can start clean.
 *
 * Usually it is what an installation left when it stopped before writing the
 * config. It is renamed rather than deleted all the same: a config lost by
 * accident must not take the content with it.
 */
export async function setAsideOrphanDatabase(): Promise<void> {
  const path = THEI_SERVER.contentPath('thei.db');
  if (!existsSync(path)) return;
  const aside = `${path}.without-config-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await rename(path, aside);
  THEI_SERVER.console
    .tag('Boot')
    .warn(`A database without a config was set aside as ${aside}.`);
}
