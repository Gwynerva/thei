import { defineMigration } from './types';

/**
 * Excerpts: named parts of a diary entry, an event or a project, each about
 * something in the archive and with a page of its own. A new table and
 * nothing else: an excerpt's text is a row of `content`, its banner a
 * placement, and what it is about a relation, in the tables those already
 * have. No existing row changes shape.
 */
export default defineMigration({
  id: '0.0.8/001-excerpts',
  version: '0.0.8',
  title: { en: 'Add excerpts', ru: 'Отрывки' },
  description: {
    en: 'Diary entries, events and projects can hold excerpts: named parts about something in the archive, each with a page of its own.',
    ru: 'У записей дневника, событий и проектов появляются отрывки: названные части про что-то в архиве, каждая со своей страницей.',
  },
  up({ rawDb }) {
    for (const statement of [
      "CREATE TABLE IF NOT EXISTS `excerpts` (`excerptUuid` text PRIMARY KEY NOT NULL, `parentType` text NOT NULL, `parentId` text NOT NULL, `title` text NOT NULL, `summary` text DEFAULT '' NOT NULL, `humanReadableSlug` text NOT NULL, `publicId` text NOT NULL, `isPrivate` integer DEFAULT false NOT NULL, `sortOrder` integer NOT NULL, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL)",
      'CREATE INDEX IF NOT EXISTS `excerpts-parent-idx` ON `excerpts` (`parentType`,`parentId`,`sortOrder`)',
      'CREATE UNIQUE INDEX IF NOT EXISTS `excerpts-public-id-unique` ON `excerpts` (`publicId`)',
    ])
      rawDb.prepare(statement).run();
  },
});
