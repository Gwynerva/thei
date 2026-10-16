import { defineMigration } from './types';

/**
 * Every file's caption is inline markup now, as a picture's always was: the
 * caption of a recording and of a file to download was plain text, stored as
 * typed. Read as markup, a `<` or an `&` in it would be taken for a tag or an
 * entity, so those are written as markup writes them, and the caption reads
 * the same words it did.
 *
 * Texts and their kept drafts and versions are rewritten here rather than in
 * a task: a site older than 0.0.4 runs that release's task over every text
 * before any task of this one, and it reads captions as this release does.
 * It runs in one transaction with its ledger row, so a text is never escaped
 * twice. Only rows that change are written; the fingerprints of drafts and
 * versions are counted again by the task `0.0.6/017-file-caption-fingerprints`.
 */
export default defineMigration({
  id: '0.0.6/016-file-captions',
  version: '0.0.6',
  title: {
    en: 'Let file captions carry markup',
    ru: 'Разметка в подписях файлов',
  },
  description: {
    en: 'The captions of recordings and files to download may now hold bold, italic, links and hints, as a picture’s caption does.',
    ru: 'В подписях записей и файлов для скачивания теперь можно выделять текст, ставить ссылки и подсказки, как в подписи картинки.',
  },
  up({ rawDb, log }) {
    const escape = (text: string) =>
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const rewrite = (source: string) => {
      const parsed = JSON.parse(source) as { blocks?: unknown };
      if (!Array.isArray(parsed.blocks)) return undefined;
      let changed = false;
      for (const block of parsed.blocks) {
        if (
          !block ||
          typeof block !== 'object' ||
          ((block as { type?: unknown }).type !== 'contentAudio' &&
            (block as { type?: unknown }).type !== 'contentAttachment')
        )
          continue;
        const data = (block as { data?: unknown }).data as
          { caption?: unknown } | undefined;
        if (!data || typeof data.caption !== 'string') continue;
        const caption = escape(data.caption);
        if (caption === data.caption) continue;
        data.caption = caption;
        changed = true;
      }
      return changed ? JSON.stringify(parsed) : undefined;
    };

    let texts = 0;
    for (const table of ['content', 'content-history'] as const) {
      const key = table === 'content' ? 'contentUuid' : 'id';
      const update = rawDb.prepare(
        `UPDATE \`${table}\` SET \`data\` = ? WHERE \`${key}\` = ?`,
      );
      const rows = rawDb
        .prepare(
          `SELECT \`${key}\` AS \`id\`, \`data\` FROM \`${table}\` ` +
            "WHERE `data` LIKE '%contentAudio%' OR `data` LIKE '%contentAttachment%'",
        )
        .all() as { id: string; data: string }[];
      for (const row of rows) {
        const next = rewrite(row.data);
        if (next === undefined) continue;
        update.run(next, row.id);
        texts++;
      }
    }
    if (texts) log(`Rewrote the file captions of ${texts} texts and drafts.`);
  },
});
