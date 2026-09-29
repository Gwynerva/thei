import { defineMigration } from './types';

/**
 * Keeps the unsaved drafts of content fields and the versions they went
 * through, on the server.
 *
 * Until now an editor kept its snapshots in the browser's localStorage, where
 * new text had no history that survived a crash, the storage filled up
 * without a word, and a text cleared and saved could only come back from a
 * backup. Drafts now reach the server seconds after they are typed; versions
 * are kept for two days and then go.
 *
 * The table starts empty. Nothing existing is read or converted: the old
 * browser snapshots are deliberately left behind.
 */
export default defineMigration({
  id: '0.0.3/002-content-history',
  version: '0.0.3',
  title: {
    en: 'Keep drafts and versions of texts',
    ru: 'Хранение черновиков и версий текстов',
  },
  description: {
    en: 'Unsaved text is now kept on the server as you type, and every text keeps its versions of the last two days.',
    ru: 'Несохранённый текст теперь хранится на сервере по ходу набора, а у каждого текста сохраняются версии за последние двое суток.',
  },
  up({ rawDb, log }) {
    rawDb
      .prepare(
        'CREATE TABLE IF NOT EXISTS `content-history` (' +
          '`id` text PRIMARY KEY NOT NULL, ' +
          '`ownerType` text NOT NULL, ' +
          '`ownerRef` text NOT NULL, ' +
          '`slot` text NOT NULL, ' +
          '`kind` text NOT NULL, ' +
          '`reason` text, ' +
          '`data` text NOT NULL, ' +
          '`digest` text NOT NULL, ' +
          '`wordCount` integer NOT NULL, ' +
          '`blockCount` integer NOT NULL, ' +
          '`assetCount` integer NOT NULL, ' +
          '`size` integer NOT NULL, ' +
          '`assetUuids` text NOT NULL, ' +
          "`writer` text DEFAULT '' NOT NULL, " +
          '`createdAt` integer NOT NULL, ' +
          '`updatedAt` integer NOT NULL' +
          ')',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `content-history-field-idx` ON `content-history` (`ownerType`,`ownerRef`,`slot`,`kind`,`createdAt`)',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `content-history-kind-idx` ON `content-history` (`kind`,`createdAt`)',
      )
      .run();

    log('Content history is ready.');
  },
});
