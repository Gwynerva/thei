import { defineUpdateTask } from './types';

/**
 * Migration `0.0.6/016-file-captions` wrote the captions of recordings and
 * files as markup, in the kept drafts and versions of texts too. Their
 * fingerprints are counted again from what they now hold, as a save would
 * count them, so a draft still reads as the version it matches.
 */
export default defineUpdateTask({
  id: '0.0.6/017-file-caption-fingerprints',
  version: '0.0.6',
  title: {
    en: 'Recount the drafts of texts',
    ru: 'Пересчёт черновиков текстов',
  },
  description: {
    en: 'Drafts and versions whose file captions were rewritten get their fingerprints again.',
    ru: 'Черновики и версии с переписанными подписями файлов получают свои отпечатки заново.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} drafts and versions`,
    ru: `${done} из ${total} черновиков и версий`,
  }),
  async run({ progress, log }) {
    const { refreshContentHistoryFingerprints } =
      await import('#layers/thei/server/thei/content/history');
    const { refreshed } = await refreshContentHistoryFingerprints(
      progress,
      (id) =>
        log(
          `A draft or version (${id}) could not be read and was left as it was.`,
        ),
    );
    if (refreshed) log(`Recounted ${refreshed} drafts and versions.`);
  },
});
