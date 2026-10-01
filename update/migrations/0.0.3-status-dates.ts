import { defineMigration } from './types';

/**
 * Gives a status a date of its own.
 *
 * Until now a status was dated by the moment it was saved, so a history could
 * not be filled in afterwards. The owner now picks the day a status speaks of;
 * the moment it was written stays in `createdAt` and orders a day's statuses.
 *
 * Every existing status gets the day it has always been shown under: the UTC
 * day of `createdAt`.
 */
export default defineMigration({
  id: '0.0.3/001-status-dates',
  version: '0.0.3',
  title: {
    en: 'Give statuses a date',
    ru: 'Добавление даты статусам',
  },
  description: {
    en: 'Statuses of the profile and of projects can now be dated by hand; existing ones keep the day they were shown under.',
    ru: 'Статусам профиля и проектов теперь можно задавать дату вручную; у существующих остаётся день, под которым они показывались.',
  },
  up({ rawDb, log }) {
    rawDb
      .prepare(
        "ALTER TABLE `statuses` ADD COLUMN `date` text DEFAULT '' NOT NULL",
      )
      .run();
    const dated = rawDb
      .prepare(
        "UPDATE `statuses` SET `date` = strftime('%Y-%m-%d', `createdAt` / 1000, 'unixepoch')",
      )
      .run();
    log(`Dated ${dated.changes} statuses.`);
    rawDb.prepare('DROP INDEX IF EXISTS `statuses-owner-date-idx`').run();
    rawDb
      .prepare(
        'CREATE INDEX `statuses-owner-date-idx` ON `statuses` (`ownerType`,`ownerId`,`date`,`createdAt`,`id`)',
      )
      .run();
  },
});
