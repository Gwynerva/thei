import { defineMigration } from './types';

/**
 * Dated periods gain a declared precision: the owner can say that the day, the
 * month or even the year is a guess, and explain the guess in their own words.
 *
 * Existing rows are exact by definition — they were entered as exact dates —
 * so the defaults carry every instance over without touching a single value.
 */
export default defineMigration({
  id: '0.0.2/002-date-precision',
  version: '0.0.2',
  title: {
    en: 'Add date precision to periods',
    ru: 'Добавление точности к датам периодов',
  },
  description: {
    en: 'Stage and event periods can now record how certain their dates are.',
    ru: 'Этапы и события теперь могут хранить степень уверенности в своих датах.',
  },
  // A fresh installation starts from the baseline, which already has these
  // columns, and only then replays the registry — hence the guard.
  up({ rawDb }) {
    const columns = new Set(
      (
        rawDb.prepare('PRAGMA table_info(`stage-periods`)').all() as {
          name: string;
        }[]
      ).map((column) => column.name),
    );

    if (!columns.has('precision')) {
      rawDb
        .prepare(
          "ALTER TABLE `stage-periods` ADD COLUMN `precision` text DEFAULT 'exact' NOT NULL",
        )
        .run();
    }
    if (!columns.has('precisionNote')) {
      rawDb
        .prepare(
          "ALTER TABLE `stage-periods` ADD COLUMN `precisionNote` text DEFAULT '' NOT NULL",
        )
        .run();
    }
  },
});
