import { defineMigration } from './types';

/**
 * Every template is offered everywhere — on the AI page and in every
 * entity's ✦ — and the owner's words in the request say what it looks at:
 * where a template was offered goes.
 */
export default defineMigration({
  id: '0.0.6/015-ai-templates-everywhere',
  version: '0.0.6',
  title: {
    en: 'Offer AI templates everywhere',
    ru: 'Шаблоны ИИ предлагаются везде',
  },
  description: {
    en: 'Templates are no longer limited to some kinds of entity.',
    ru: 'Шаблоны больше не привязаны к видам сущностей.',
  },
  up({ rawDb }) {
    rawDb.prepare('ALTER TABLE `ai-templates` DROP COLUMN `offerOn`').run();
  },
});
