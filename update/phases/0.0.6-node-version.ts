import { compareVersions, parseVersion } from '../semver';
import { resolveUpdateText } from '../text';
import { siteNode } from './site-node';
import { defineUpdatePhase } from './types';

/**
 * Makes sure the Node that runs the site is one Nuxt supports before anything
 * is built.
 *
 * Nuxt 4.6 asks for Node 22.22.3, 24.15.0 or 26 and later. A server that the
 * installer set up before it asked for the same may run an older Node; on
 * one, this phase fails, so the update stops before the build, the previous
 * manifest and engine are put back, and the site goes on as it was.
 *
 * When Nuxt raises its requirement again, change `supportedNode` (the test
 * compares it with the installed Nuxt) and move this phase to that release,
 * so that every update reaching the new requirement runs it.
 */

/** Nuxt's `engines.node`. `update/install.sh` asks for the same. */
export const supportedNode = '^22.22.3 || ^24.15.0 || >=26.0.0';

/** Whether `version` falls in `range`: `^` and `>=` bounds joined by `||`. */
export function satisfiesNodeRange(version: string, range: string): boolean {
  const current = parseVersion(version);
  if (!current) return false;
  return range.split('||').some((part) => {
    const match = /^\s*(\^|>=)\s*(\S+)\s*$/.exec(part);
    const bound = match && parseVersion(match[2]!);
    if (!bound) throw new Error(`Cannot read the Node range "${range}".`);
    return (
      compareVersions(version, match[2]!) >= 0 &&
      (match[1] === '>=' || current.major === bound.major)
    );
  });
}

export default defineUpdatePhase({
  id: '0.0.6/001-node-version',
  version: '0.0.6',
  title: {
    en: 'Check the Node.js version',
    ru: 'Проверка версии Node.js',
  },
  description: {
    en: 'The new version of Nuxt needs a recent Node.js; the update goes on only if this server runs one.',
    ru: 'Новой версии Nuxt нужен свежий Node.js; обновление продолжится, только если он стоит на этом сервере.',
  },
  async run({ languageCode, exec }) {
    const version = (await exec(siteNode(), ['--version'])).output.trim();
    if (satisfiesNodeRange(version, supportedNode)) return;
    throw new Error(
      resolveUpdateText(
        {
          en: `The site runs on Node.js ${version}, and the new version needs ${supportedNode}, so the update stops here and the site keeps its current version. Update Node.js (on a server set up by the installer: apt-get update && apt-get install nodejs), restart the site and try again.`,
          ru: `Сайт работает на Node.js ${version}, а новой версии нужен ${supportedNode}, поэтому обновление остановлено, а сайт остаётся на текущей версии. Обновите Node.js (на сервере, который настроил установщик: apt-get update && apt-get install nodejs), перезапустите сайт и повторите обновление.`,
        },
        languageCode,
      ),
    );
  },
});
