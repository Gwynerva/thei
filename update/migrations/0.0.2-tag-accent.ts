import { defineMigration } from './types';

/**
 * Takes the hand-picked accent colour away from tags.
 *
 * Every other entity without an icon already derives its accent from its own
 * name, and an icon supplies one when there is one. A tag was the last thing
 * whose colour was set by hand, which meant the same tag could look unrelated
 * to the projects and events carrying it. The colour is now computed, so the
 * stored column has nothing left to say.
 */
export default defineMigration({
  id: '0.0.2/005-tag-accent',
  version: '0.0.2',
  title: {
    en: 'Derive tag colours',
    ru: 'Вычисляемые цвета тегов',
  },
  description: {
    en: 'A tag now takes its colour from its icon, or from its name, like every other entity.',
    ru: 'Тег берёт цвет из своей иконки или из названия, как и остальные сущности.',
  },
  up({ rawDb }) {
    // A fresh installation starts from a baseline that never had the column.
    const columns = rawDb.pragma("table_info('tags')") as Array<{
      name: string;
    }>;
    if (!columns.some((column) => column.name === 'accentColor')) return;
    rawDb.prepare('ALTER TABLE `tags` DROP COLUMN `accentColor`').run();
  },
});
