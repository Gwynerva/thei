import { defineMigration } from './types';

/**
 * Tables behind the two kinds of temporary link added in 0.0.2: the one-time
 * link that signs the owner in on another device, and the share link that
 * opens one private project or event for a while.
 *
 * Both hold hashes and timestamps only, so an existing instance gains them
 * empty and unused until the owner creates the first link.
 */
export default defineMigration({
  id: '0.0.2/001-access-links',
  version: '0.0.2',
  title: {
    en: 'Add sign-in and share links',
    ru: 'Добавление ссылок для входа и доступа',
  },
  description: {
    en: 'Creates the tables for one-time sign-in links and temporary share links.',
    ru: 'Создаёт таблицы для одноразовых ссылок входа и временных ссылок доступа.',
  },
  // `IF NOT EXISTS` throughout: a fresh installation starts from the baseline,
  // which already describes these tables, and then replays the registry.
  up({ rawDb }) {
    rawDb
      .prepare(
        'CREATE TABLE IF NOT EXISTS `sign-in-links` (' +
          '`tokenHash` text PRIMARY KEY NOT NULL, ' +
          '`createdAt` integer NOT NULL, ' +
          '`expiresAt` integer NOT NULL, ' +
          '`createdFrom` text' +
          ')',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `sign-in-links-expires-idx` ON `sign-in-links` (`expiresAt`)',
      )
      .run();
    rawDb
      .prepare(
        'CREATE TABLE IF NOT EXISTS `share-links` (' +
          '`shareUuid` text PRIMARY KEY NOT NULL, ' +
          '`tokenHash` text NOT NULL, ' +
          '`entityType` text NOT NULL, ' +
          '`entityUuid` text NOT NULL, ' +
          '`createdAt` integer NOT NULL, ' +
          '`expiresAt` integer NOT NULL' +
          ')',
      )
      .run();
    rawDb
      .prepare(
        'CREATE UNIQUE INDEX IF NOT EXISTS `share-links_tokenHash_unique` ON `share-links` (`tokenHash`)',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `share-links-entity-idx` ON `share-links` (`entityType`,`entityUuid`)',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `share-links-expires-idx` ON `share-links` (`expiresAt`)',
      )
      .run();
  },
});
