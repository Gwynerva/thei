import { createHash } from 'node:crypto';
import { defineMigration } from './types';

const analyticsFields = [
  'googleTagId',
  'googleSiteVerification',
  'yandexMetrikaId',
  'yandexVerification',
] as const;

/**
 * Brings `thei.config.json` to the shape 0.0.2 reads, so the engine never has
 * to fill in what an older release did not write:
 *
 * - `siteUrl` is always present, empty meaning "derive it from the request";
 * - `analytics` is always present, every identifier empty until set;
 * - the backup token is kept only as its SHA-256. Clients already installed
 *   keep working: they send the token, and the server compares its hash.
 */
export default defineMigration({
  id: '0.0.2/011-config-shape',
  version: '0.0.2',
  title: {
    en: 'Update the settings file',
    ru: 'Обновление файла настроек',
  },
  async run({ readConfig, writeConfig }) {
    const config = await readConfig();

    if (typeof config.siteUrl !== 'string') config.siteUrl = '';

    const analytics =
      config.analytics && typeof config.analytics === 'object'
        ? (config.analytics as Record<string, unknown>)
        : {};
    config.analytics = Object.fromEntries(
      analyticsFields.map((field) => [
        field,
        typeof analytics[field] === 'string' ? analytics[field] : '',
      ]),
    );

    const backup = config.backup as
      | { token?: unknown; tokenHash?: unknown; createdAt?: unknown }
      | undefined;
    if (backup && typeof backup.token === 'string') {
      config.backup = {
        tokenHash: createHash('sha256').update(backup.token).digest('hex'),
        createdAt:
          typeof backup.createdAt === 'string'
            ? backup.createdAt
            : new Date().toISOString(),
      };
    } else if (backup && typeof backup.tokenHash !== 'string') {
      delete config.backup;
    }

    await writeConfig(config);
  },
});
