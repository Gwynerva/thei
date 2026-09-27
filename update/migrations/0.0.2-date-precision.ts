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
  up({ rawDb }) {
    rawDb
      .prepare(
        "ALTER TABLE `stage-periods` ADD COLUMN `precision` text DEFAULT 'exact' NOT NULL",
      )
      .run();
    rawDb
      .prepare(
        "ALTER TABLE `stage-periods` ADD COLUMN `precisionNote` text DEFAULT '' NOT NULL",
      )
      .run();
  },
});
