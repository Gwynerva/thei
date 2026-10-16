import { defineMigration } from './types';

/**
 * Projects, events and pages gain synonyms, as tags have: the other names
 * the owner knows them by — «bg3» for Baldur's Gate 3 — which every search
 * finds them by and no page ever shows. A site starts with none.
 */
export default defineMigration({
  id: '0.0.6/010-entity-synonyms',
  version: '0.0.6',
  title: {
    en: 'Add synonyms to projects, events and pages',
    ru: 'Синонимы у проектов, событий и страниц',
  },
  description: {
    en: 'Other names an entity is found by in every search.',
    ru: 'Другие имена, по которым сущность находится в любом поиске.',
  },
  up({ rawDb }) {
    for (const table of ['projects', 'events', 'pages']) {
      rawDb
        .prepare(
          `ALTER TABLE \`${table}\` ADD COLUMN \`synonyms\` text DEFAULT '[]' NOT NULL`,
        )
        .run();
    }
  },
});
