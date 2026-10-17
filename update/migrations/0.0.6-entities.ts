import { defineMigration } from './types';

/**
 * What entities gain besides AI: projects, events and pages keep synonyms —
 * the other names the owner calls them by, which search and links know; the
 * headings of texts keep the anchors links name, so a renamed one is found
 * again; and a family of files keeps one description of what it is.
 */
export default defineMigration({
  id: '0.0.6/003-entities',
  version: '0.0.6',
  title: {
    en: 'Add synonyms, heading anchors and file descriptions',
    ru: 'Синонимы, якоря заголовков и описания файлов',
  },
  description: {
    en: 'Projects, events and pages get synonyms; the headings of texts and the files of the library get tables of their own.',
    ru: 'У проектов, событий и страниц появляются синонимы, у заголовков текстов и у файлов библиотеки — свои таблицы.',
  },
  up({ rawDb }) {
    for (const table of ['projects', 'events', 'pages']) {
      const columns = rawDb.prepare(`PRAGMA table_info('${table}')`).all() as {
        name: string;
      }[];
      if (!columns.some((column) => column.name === 'synonyms'))
        rawDb
          .prepare(
            `ALTER TABLE \`${table}\` ADD COLUMN \`synonyms\` text DEFAULT '[]' NOT NULL`,
          )
          .run();
    }
    for (const statement of [
      'CREATE TABLE IF NOT EXISTS `asset-descriptions` (`familyUuid` text PRIMARY KEY NOT NULL, `text` text NOT NULL, `updatedAt` integer NOT NULL)',
      'CREATE TABLE IF NOT EXISTS `content-anchors` (`ownerType` text NOT NULL, `ownerId` text NOT NULL, `slot` text NOT NULL, `anchor` text NOT NULL, `blockId` text NOT NULL, `title` text NOT NULL, `seenAt` integer NOT NULL, PRIMARY KEY(`ownerType`, `ownerId`, `slot`, `anchor`, `blockId`))',
      'CREATE INDEX IF NOT EXISTS `content-anchors-field-idx` ON `content-anchors` (`ownerType`,`ownerId`,`slot`)',
    ])
      rawDb.prepare(statement).run();
  },
});
