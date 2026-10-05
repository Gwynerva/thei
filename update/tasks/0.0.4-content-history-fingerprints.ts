import { defineUpdateTask } from './types';

/**
 * Migration 0.0.4/002 rewrote the links to stages inside every kept draft and
 * version of a text, so they now name the sections the stages became. What a
 * row says about its own text — its fingerprint and its size — still
 * describes the old words, and a draft equal to its saved text would be
 * offered once as different. Both are recomputed from the rewritten text.
 */
export default defineUpdateTask({
  id: '0.0.4/002-content-history-fingerprints',
  version: '0.0.4',
  title: {
    en: 'Recount the drafts of texts',
    ru: 'Пересчёт черновиков текстов',
  },
  description: {
    en: 'Drafts and versions whose links to stages now lead to sections get their fingerprints recounted.',
    ru: 'У черновиков и версий, чьи ссылки на этапы теперь ведут на разделы, пересчитываются отпечатки.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} drafts and versions`,
    ru: `${done} из ${total} черновиков и версий`,
  }),
  async run({ progress, log }) {
    const { refreshContentHistoryFingerprints } =
      await import('#layers/thei/server/thei/content/history');
    const { refreshed, total } = await refreshContentHistoryFingerprints(
      progress,
      (id) =>
        log(
          `A draft or version (${id}) could not be read and was left as it was.`,
        ),
    );
    if (refreshed)
      log(`Recounted ${refreshed} of ${total} drafts and versions.`);
  },
});
