import { defineMigration } from './types';

/**
 * A link a project or an event lists by hand shows the page as it presents
 * itself — its own title and description — with the owner's note under it.
 *
 * Each entry used to carry a required name that stood in for the page's
 * title. A name that said something of the owner's becomes the entry's note.
 * One that only repeated the page's title or its host, as the form filled it
 * in, is dropped: the page's own title shows, as it did through that name.
 * The profile keeps its names, which label its chips, and gains a note too.
 */

const LISTS = ['project-external-links', 'event-external-links'];

type Row = { rowid: number; url: string; name: string; title: string | null };

/** A text as compared here, whitespace collapsed; written out on purpose. */
function clean(text: string | null) {
  return (text ?? '').trim().replace(/\s+/gu, ' ');
}

/** The host the form offered as a name; written out on purpose. */
function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export default defineMigration({
  id: '0.0.3/004-external-link-notes',
  version: '0.0.3',
  title: {
    en: 'Add notes to external links',
    ru: 'Пояснения к внешним ссылкам',
  },
  description: {
    en: 'A listed link shows the page’s own title with the owner’s note under it; a name of its own becomes that note.',
    ru: 'Ссылка из списка показывает заголовок самой страницы и пояснение под ним; собственное название ссылки становится пояснением.',
  },
  up({ rawDb }) {
    for (const table of [...LISTS, 'profile-external-links'])
      rawDb
        .prepare(
          `ALTER TABLE \`${table}\` ADD COLUMN \`note\` text DEFAULT '' NOT NULL`,
        )
        .run();

    for (const table of LISTS) {
      const rows = rawDb
        .prepare(
          `SELECT \`list\`.rowid AS \`rowid\`, \`list\`.\`url\`, \`list\`.\`name\`, \`link\`.\`title\` FROM \`${table}\` AS \`list\` LEFT JOIN \`external-links\` AS \`link\` ON \`link\`.\`url\` = \`list\`.\`url\``,
        )
        .all() as Row[];
      const keep = rawDb.prepare(
        `UPDATE \`${table}\` SET \`note\` = ? WHERE rowid = ?`,
      );
      for (const row of rows) {
        const name = clean(row.name);
        if (
          name &&
          name !== clean(row.title) &&
          name.toLowerCase() !== hostname(row.url).toLowerCase()
        )
          keep.run(name, row.rowid);
      }
      rawDb.prepare(`ALTER TABLE \`${table}\` DROP COLUMN \`name\``).run();
    }
  },
});
