import { defineMigration } from './types';

/**
 * A stored file learns when it was uploaded. Until now a row kept only
 * `touchedAt`, which moves on every reuse and every save of a text that holds
 * the file, so "uploaded last week" could not be asked of it. A row already
 * stored takes its `touchedAt` as the best date there is: the day it was
 * last touched is never earlier than the day it came.
 */
export default defineMigration({
  id: '0.0.8/004-asset-created-at',
  version: '0.0.8',
  title: {
    en: 'Remember when each file was uploaded',
    ru: 'Запомнить, когда загружен каждый файл',
  },
  description: {
    en: 'Files already stored take the last time they were used as their upload date.',
    ru: 'Уже загруженные файлы получают датой загрузки время, когда их использовали в последний раз.',
  },
  up({ rawDb }) {
    rawDb
      .prepare(
        'ALTER TABLE `assets` ADD COLUMN `createdAt` integer DEFAULT 0 NOT NULL',
      )
      .run();
    rawDb.prepare('UPDATE `assets` SET `createdAt` = `touchedAt`').run();
  },
});
