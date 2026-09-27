import { defineMigration } from './types';

/**
 * Tables behind the two kinds of temporary link added in 0.0.2: the one-time
 * link that signs the owner in on another device, and the share link that
 * opens one private project, event, page or diary entry for a while.
 *
 * An existing instance gains both empty and unused until the owner creates the
 * first link. A sign-in link keeps only the hash of its token; a share link
 * keeps its token, so its address can be copied again later.
 */
export default defineMigration({
  id: '0.0.2/001-access-links-tokens',
  version: '0.0.2',
  title: {
    en: 'Add sign-in and temporary access links',
    ru: 'Добавление ссылок для входа и временного доступа',
  },
  description: {
    en: 'Creates the tables for one-time sign-in links and temporary access links.',
    ru: 'Создаёт таблицы для одноразовых ссылок входа и ссылок временного доступа.',
  },
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
          '`token` text NOT NULL, ' +
          '`entityType` text NOT NULL, ' +
          '`entityUuid` text NOT NULL, ' +
          "`label` text DEFAULT '' NOT NULL, " +
          '`createdAt` integer NOT NULL, ' +
          '`extendedAt` integer, ' +
          '`expiresAt` integer NOT NULL' +
          ')',
      )
      .run();
    rawDb
      .prepare(
        'CREATE UNIQUE INDEX IF NOT EXISTS `share-links_token_unique` ON `share-links` (`token`)',
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
