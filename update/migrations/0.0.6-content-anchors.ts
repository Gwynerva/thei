import { defineMigration } from './types';

/**
 * A text's headings remember the anchors they have had, so a link to one
 * renamed since can be pointed at it again. The record starts empty: the
 * first save of a text after the update writes the anchors it had and has.
 */
export default defineMigration({
  id: '0.0.6/012-content-anchors',
  version: '0.0.6',
  title: {
    en: 'Remember the anchors of headings',
    ru: 'Память о якорях заголовков',
  },
  description: {
    en: 'Lets a link to a renamed heading be pointed at it again.',
    ru: 'Чтобы ссылку на переименованный заголовок можно было исправить.',
  },
  up({ rawDb }) {
    for (const statement of [
      'CREATE TABLE IF NOT EXISTS `content-anchors` (`ownerType` text NOT NULL, `ownerId` text NOT NULL, `slot` text NOT NULL, `anchor` text NOT NULL, `blockId` text NOT NULL, `title` text NOT NULL, `seenAt` integer NOT NULL, PRIMARY KEY(`ownerType`, `ownerId`, `slot`, `anchor`, `blockId`))',
      'CREATE INDEX IF NOT EXISTS `content-anchors-field-idx` ON `content-anchors` (`ownerType`, `ownerId`, `slot`)',
    ])
      rawDb.prepare(statement).run();
  },
});
