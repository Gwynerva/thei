import { defineUpdateTask } from './types';

/**
 * The normalizer of inline markup no longer keeps a link that leads nowhere,
 * nor the closing tag of a hint it dropped (`shared/content-link.ts`). Drafts
 * and versions kept before were counted from the older form: their
 * fingerprints are counted again, as a save would count them now, so a
 * draft equal to its text still reads as that text.
 */
export default defineUpdateTask({
  id: '0.0.7/001-inline-markup-fingerprints',
  version: '0.0.7',
  title: {
    en: 'Recount the drafts of texts',
    ru: 'Пересчёт черновиков текстов',
  },
  description: {
    en: 'Drafts and versions get their fingerprints again, counted by the new rules of links and hints.',
    ru: 'Черновики и версии получают свои отпечатки заново, по новым правилам ссылок и подсказок.',
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
