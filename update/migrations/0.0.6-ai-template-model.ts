import { defineMigration } from './types';

/**
 * A template no longer names a model: the model is chosen for a session,
 * from the service the connection has now. A name a template kept went
 * wrong as soon as the service changed. A session's model, which told the
 * model that answered it last, now tells the one chosen for it: none was.
 */
export default defineMigration({
  id: '0.0.6/019-ai-template-model',
  version: '0.0.6',
  title: {
    en: 'Choose the AI model for a session, not a template',
    ru: 'Модель ИИ выбирается для сессии, а не для шаблона',
  },
  description: {
    en: 'Templates stop naming a model of their own.',
    ru: 'Шаблоны больше не хранят свою модель.',
  },
  up({ rawDb }) {
    const columns = new Set(
      (
        rawDb.prepare("PRAGMA table_info('ai-templates')").all() as {
          name: string;
        }[]
      ).map((column) => column.name),
    );
    if (columns.has('model'))
      rawDb.prepare('ALTER TABLE `ai-templates` DROP COLUMN `model`').run();
    rawDb.prepare('UPDATE `ai-sessions` SET `model` = NULL').run();
  },
});
