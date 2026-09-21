import { defineMigration } from './types';

/**
 * Projects, events and pages gain a reminder: a short note to self that only
 * the owner ever sees, and that marks the entity with a warning wherever it
 * appears. The longer private notes live in `content` under their own slot, so
 * they need no column of their own.
 */
export default defineMigration({
  id: '0.0.2/003-entity-reminders',
  version: '0.0.2',
  title: {
    en: 'Add reminders to projects, events and pages',
    ru: 'Добавление напоминаний к проектам, событиям и страницам',
  },
  description: {
    en: 'An owner-only reminder that flags an entity until it is cleared.',
    ru: 'Видимое только владельцу напоминание, помечающее сущность до его снятия.',
  },
  up({ rawDb }) {
    for (const table of ['projects', 'events', 'pages']) {
      const columns = (
        rawDb.prepare(`PRAGMA table_info(\`${table}\`)`).all() as {
          name: string;
        }[]
      ).map((column) => column.name);
      if (columns.includes('reminder')) continue;
      rawDb
        .prepare(
          `ALTER TABLE \`${table}\` ADD COLUMN \`reminder\` text DEFAULT '' NOT NULL`,
        )
        .run();
    }
  },
});
