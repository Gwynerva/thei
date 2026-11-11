import { defineUpdateTask } from './types';

/**
 * Every block of a text is now stored with an id, given as the text is saved
 * (`shared/content-block-ids.ts`). Texts written as editing Markdown — by an
 * app over MCP, by the site's model — were stored without, so a find of the
 * search could not lead to its place in them. Every stored block that has no
 * id, or repeats the id of a block before it, gets one here, once.
 */
export default defineUpdateTask({
  id: '0.0.9/001-block-ids',
  version: '0.0.9',
  title: {
    en: 'Name the blocks of texts written outside the editor',
    ru: 'Идентификаторы блоков в текстах, написанных не в редакторе',
  },
  description: {
    en: 'Blocks of texts written by an app or a model get the ids a search find and a link lead to a place by. Not a word changes.',
    ru: 'Блоки текстов, написанных приложением или моделью, получают идентификаторы, по которым находка поиска и ссылка ведут к месту. Ни одно слово не меняется.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} texts`,
    ru: `${done} из ${total} текстов`,
  }),
  async run({ progress, log }) {
    const { giveStoredBlockIds } =
      await import('#layers/thei/server/thei/content/block-ids');
    const { changed } = await giveStoredBlockIds(progress, log);
    if (changed) log(`Gave ids to the blocks of ${changed} texts.`);
  },
});
