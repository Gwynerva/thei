import { defineMigration } from './types';

/**
 * A period of an event or a stage gains a label of its own: what that stretch
 * was, in the owner's words, shown above its dates.
 *
 * No period had one before, so every row starts without it and nothing else
 * changes.
 */
export default defineMigration({
  id: '0.0.4/001-period-labels',
  version: '0.0.4',
  title: {
    en: 'Add labels to periods',
    ru: 'Подписи временных промежутков',
  },
  description: {
    en: 'Each period of an event or a stage can now say what it was.',
    ru: 'Каждый промежуток события или этапа теперь может сказать, чем он был.',
  },
  up({ rawDb }) {
    rawDb
      .prepare(
        "ALTER TABLE `stage-periods` ADD COLUMN `label` text DEFAULT '' NOT NULL",
      )
      .run();
  },
});
