import { defineMigration } from './types';

/**
 * Files gain a description of their own: what a picture shows, what a
 * recording or a document is about. One per family of a file, the original
 * and its variants. A site starts with none.
 */
export default defineMigration({
  id: '0.0.6/013-asset-descriptions',
  version: '0.0.6',
  title: {
    en: 'Add descriptions to files',
    ru: 'Расшифровки файлов',
  },
  description: {
    en: 'What a file shows or is about, in words: for search, for AI and for those who cannot see it.',
    ru: 'Что показано в файле или о чём он, словами: для поиска, для AI и для тех, кто его не видит.',
  },
  up({ rawDb }) {
    rawDb
      .prepare(
        'CREATE TABLE IF NOT EXISTS `asset-descriptions` (`familyUuid` text PRIMARY KEY NOT NULL, `text` text NOT NULL, `updatedAt` integer NOT NULL)',
      )
      .run();
  },
});
