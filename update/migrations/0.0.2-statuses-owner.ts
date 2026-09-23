import { defineMigration } from './types';

/**
 * Gives a status an owner.
 *
 * Until now a status could only belong to the profile, so `profile-statuses`
 * needed no owner column. Projects keep status histories of their own from
 * 0.0.2 on, and one table with an owner is what keeps the pagination, the
 * "empty status" rule and the timeline hydration single-sourced instead of
 * copied per owner kind.
 *
 * Asset usages are deliberately left alone: a status icon is still recorded
 * under `profile-status`, and a project's is recorded under `project-status`.
 * Renaming the container would have rewritten rows in `asset-usages` for no
 * gain beyond tidiness, and reuse counting reads those rows.
 */
export default defineMigration({
  id: '0.0.2/004-statuses-owner',
  version: '0.0.2',
  title: {
    en: 'Give statuses an owner',
    ru: 'Добавление владельца статусам',
  },
  description: {
    en: 'Moves profile statuses into one table that projects share, keeping their text, icons and dates.',
    ru: 'Переносит статусы профиля в общую таблицу, которой пользуются и проекты, сохраняя их текст, иконки и даты.',
  },
  up({ rawDb, log }) {
    rawDb
      .prepare(
        'CREATE TABLE IF NOT EXISTS `statuses` (' +
          '`id` text PRIMARY KEY NOT NULL, ' +
          '`ownerType` text NOT NULL, ' +
          '`ownerId` text NOT NULL, ' +
          "`kind` text DEFAULT 'regular' NOT NULL, " +
          '`assetUuid` text, ' +
          '`text` text NOT NULL, ' +
          '`createdAt` integer NOT NULL' +
          ')',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `statuses-owner-date-idx` ON `statuses` (`ownerType`,`ownerId`,`createdAt`,`id`)',
      )
      .run();

    // A fresh installation starts from the baseline, which no longer describes
    // `profile-statuses` at all, and then replays this registry.
    const legacy = rawDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'profile-statuses'",
      )
      .get();
    if (!legacy) return;

    // Every instance has exactly one profile row; its id is the owner id.
    const profile = rawDb.prepare('SELECT profileId FROM profiles').get() as
      { profileId: string } | undefined;
    const ownerId = profile?.profileId ?? 'profile';

    const moved = rawDb
      .prepare(
        'INSERT OR IGNORE INTO `statuses` ' +
          '(`id`, `ownerType`, `ownerId`, `kind`, `assetUuid`, `text`, `createdAt`) ' +
          "SELECT `id`, 'profile', ?, `kind`, `assetUuid`, `text`, `createdAt` " +
          'FROM `profile-statuses`',
      )
      .run(ownerId);
    log(`Moved ${moved.changes} profile statuses.`);

    rawDb.prepare('DROP TABLE `profile-statuses`').run();
  },
});
