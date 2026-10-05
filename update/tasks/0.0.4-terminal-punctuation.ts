import { defineUpdateTask } from './types';

/**
 * Captions and headings now end by a rule, applied wherever one is saved: a
 * caption of one sentence and every heading lose their full stop, a caption
 * of several sentences gains one, and the full stop of an abbreviation stays
 * (`shared/terminal-punctuation.ts`). Everything stored before is settled once
 * here, as a save would settle it. The kept drafts and versions of texts are
 * brought in line with their saves too, those whose links to stages migration
 * `0.0.4/002` rewrote included: their fingerprints are recounted from the
 * words they now hold.
 */
export default defineUpdateTask({
  id: '0.0.4/004-terminal-punctuation',
  version: '0.0.4',
  title: {
    en: 'Settle the endings of captions and headings',
    ru: 'Знаки в конце подписей и заголовков',
  },
  description: {
    en: 'A caption of one sentence and every heading lose their full stop, a caption of several sentences gains one; abbreviations keep theirs.',
    ru: 'Подпись из одного предложения и любой заголовок теряют точку в конце, подпись из нескольких предложений её получает; сокращения сохраняют свою.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} records`,
    ru: `${done} из ${total} записей`,
  }),
  async run({ progress, log }) {
    const { punctuateStoredTexts } =
      await import('#layers/thei/server/thei/terminal-punctuation');
    const { changed } = await punctuateStoredTexts({
      onProgress: progress,
      log,
    });
    const summary = Object.entries(changed)
      .filter(([, value]) => value > 0)
      .map(([kind, value]) => `${value} ${kind}`)
      .join(', ');
    if (summary) log(`Settled the endings of ${summary}.`);
  },
});
