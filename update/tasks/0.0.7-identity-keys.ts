import { defineUpdateTask } from './types';

/**
 * The keys tags and the AI's dictionary are told apart by were lower-cased by
 * the server's locale; they are now by Unicode's own rules
 * (`shared/identity-key.ts`). Every stored key is counted again, so a tag or
 * a word never turns into a second one beside itself. A key another row has
 * already is left as it was and reported, never merged.
 */
export default defineUpdateTask({
  id: '0.0.7/002-identity-keys',
  version: '0.0.7',
  title: {
    en: 'Recount the keys of tags and dictionary words',
    ru: 'Пересчёт ключей тегов и слов словаря',
  },
  description: {
    en: 'Tags, dictionary words and declined word proposals get the keys this release tells them apart by.',
    ru: 'Теги, слова словаря и отклонённые предложения слов получают ключи, по которым их различает этот выпуск.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} keys`,
    ru: `${done} из ${total} ключей`,
  }),
  async run({ progress, log }) {
    const { refreshIdentityKeys } =
      await import('#layers/thei/server/thei/identity-keys');
    const { changed, skipped } = await refreshIdentityKeys(progress, log);
    if (changed) log(`Recounted ${changed} keys.`);
    if (skipped) log(`Left ${skipped} keys as they were: see above.`);
  },
});
