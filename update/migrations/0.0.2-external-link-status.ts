import { defineMigration } from './types';

/**
 * Records how the details of an external link were obtained.
 *
 * A site that did not answer used to be stored exactly like one that did,
 * with its hostname for a title, so nothing could tell the admin that a
 * link was worth refreshing. Rows from before this column are marked as
 * complete: the ones that were not correct themselves on the next refresh.
 */
export default defineMigration({
  id: '0.0.2/009-external-link-status',
  version: '0.0.2',
  title: {
    en: 'Remember how a link was read',
    ru: 'Запоминать, как была прочитана ссылка',
  },
  up({ rawDb }) {
    // A fresh installation starts from a baseline that already has the column.
    const columns = rawDb.pragma("table_info('external-links')") as Array<{
      name: string;
    }>;
    if (columns.some((column) => column.name === 'status')) return;
    rawDb
      .prepare(
        "ALTER TABLE `external-links` ADD `status` text DEFAULT 'complete' NOT NULL",
      )
      .run();
  },
});
