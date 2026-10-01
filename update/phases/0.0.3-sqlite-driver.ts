import { readlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { resolveUpdateText } from '../text';
import { defineUpdatePhase } from './types';

/**
 * Makes sure the new SQLite driver runs on this server before anything is
 * built.
 *
 * better-sqlite3 13 carries its binaries in the package and compiles nothing
 * at install. Its predecessor compiled itself against the headers of the Node
 * at hand, and Node 24.19 and later put a cleanup hook in the destructor of
 * those headers' `node::ObjectWrap` that aborts the process when the garbage
 * collector frees a statement (nodejs/node#65446): a site on such a build
 * crashed at random, taken down until systemd restarted it.
 *
 * The bundled binaries need Linux with glibc 2.34 or newer, or musl, on x64
 * or arm64. On an older server this phase fails, so the update stops before
 * the build and the site goes on as it was.
 */

/**
 * The Node that runs the site: the process that started this runner, which
 * is the update engine inside the service. `node` on the service's PATH is
 * the same one on any server the installer set up.
 */
function siteNode(): string {
  try {
    const parent = readlinkSync(`/proc/${process.ppid}/exe`);
    if (basename(parent).startsWith('node')) return parent;
  } catch {
    // No /proc: not Linux, where the question does not come up this way.
  }
  return 'node';
}

export default defineUpdatePhase({
  id: '0.0.3/001-sqlite-driver',
  version: '0.0.3',
  title: {
    en: 'Check the database driver',
    ru: 'Проверка драйвера базы данных',
  },
  description: {
    en: 'The SQLite driver now comes with its own binaries; the update goes on only if they run on this server.',
    ru: 'Драйвер SQLite теперь поставляется со своими готовыми файлами; обновление продолжится, только если они работают на этом сервере.',
  },
  async run({ theiPath, languageCode, exec }) {
    try {
      await exec(siteNode(), [join(theiPath, 'update', 'sqlite-driver.mjs')]);
    } catch {
      throw new Error(
        resolveUpdateText(
          {
            en: 'The new SQLite driver does not run on this server, so the update stops here and the site keeps its current version. It needs Linux with glibc 2.34 or newer (Debian 12, Ubuntu 22.04 or later) on x64 or arm64.',
            ru: 'Новый драйвер SQLite не работает на этом сервере, поэтому обновление остановлено, а сайт остаётся на текущей версии. Нужен Linux с glibc 2.34 или новее (Debian 12, Ubuntu 22.04 и новее) на x64 или arm64.',
          },
          languageCode,
        ),
      );
    }
  },
});
