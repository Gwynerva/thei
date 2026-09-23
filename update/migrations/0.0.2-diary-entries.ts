import { defineMigration } from './types';

/**
 * Adds the diary entry: the third kind of memory the engine keeps.
 *
 * It is the simplest of the three — a date and what was written on it — and
 * the table says so. There is no title and no summary, because a diary entry
 * is signed by its day everywhere it appears.
 *
 * The date is unique: one entry per day, strictly. That is a product decision
 * as much as a storage one, and the index is what makes it true rather than
 * merely intended.
 *
 * The body lives in the shared `content` table like every other rich text in
 * Thei (`ownerType: 'diary-entry'`, `slot: 'diary-body'`), so nothing has to
 * be created for it here.
 */
export default defineMigration({
  id: '0.0.2/007-diary-entries',
  version: '0.0.2',
  title: {
    en: 'Diary entries',
    ru: 'Записи дневника',
  },
  description: {
    en: 'Adds a place for a plain dated thought, alongside events and projects.',
    ru: 'Добавляет место для простой мысли с датой — рядом с событиями и проектами.',
  },
  up({ rawDb, log }) {
    rawDb
      .prepare(
        'CREATE TABLE IF NOT EXISTS `diary-entries` (' +
          '`diaryUuid` text PRIMARY KEY NOT NULL, ' +
          '`date` text NOT NULL, ' +
          '`access` text NOT NULL, ' +
          "`reminder` text DEFAULT '' NOT NULL, " +
          '`createdAt` integer NOT NULL, ' +
          '`updatedAt` integer NOT NULL' +
          ')',
      )
      .run();
    rawDb
      .prepare(
        'CREATE UNIQUE INDEX IF NOT EXISTS `diary-entries-date-idx` ON `diary-entries` (`date`)',
      )
      .run();

    log('Diary entries are ready.');
  },
});
