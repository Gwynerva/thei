import { defineMigration } from './types';

/**
 * A template without a schedule becomes a ready-made request the owner
 * starts — from a new session or from an entity's ✦ — and says which kinds
 * of entity it is offered on. Every template already made offers it on
 * every kind that has a text, as a new one does — so one that loses its
 * schedule later is offered as any other.
 */
export default defineMigration({
  id: '0.0.6/011-ai-template-offers',
  version: '0.0.6',
  title: {
    en: 'Offer AI templates on entity pages',
    ru: 'Шаблоны ИИ на страницах сущностей',
  },
  description: {
    en: 'Which kinds of entity a template without a schedule is offered on.',
    ru: 'У каких видов сущностей предлагается шаблон без расписания.',
  },
  up({ rawDb }) {
    rawDb
      .prepare(
        "ALTER TABLE `ai-templates` ADD COLUMN `offerOn` text DEFAULT '[]' NOT NULL",
      )
      .run();
    rawDb
      .prepare(
        `UPDATE \`ai-templates\` SET \`offerOn\` = '["project","project-section","event","diary-entry","page"]'`,
      )
      .run();
  },
});
