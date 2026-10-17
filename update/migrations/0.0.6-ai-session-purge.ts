import { defineMigration } from './types';

/**
 * A session purged after its month in the archive is deleted whole, as one
 * the owner deletes: nothing ever read the row a purge used to keep, nor the
 * entities it concerned, and its summary was never written. The rows purges
 * left go, and with them the two columns that only told of them.
 */
export default defineMigration({
  id: '0.0.6/018-ai-session-purge',
  version: '0.0.6',
  title: {
    en: 'Delete purged AI sessions whole',
    ru: 'Удаление очищенных сессий ИИ целиком',
  },
  description: {
    en: 'What was left of sessions purged from the archive goes.',
    ru: 'Остатки сессий, очищенных из архива, удаляются.',
  },
  up({ rawDb }) {
    const columns = new Set(
      (
        rawDb.prepare("PRAGMA table_info('ai-sessions')").all() as {
          name: string;
        }[]
      ).map((column) => column.name),
    );
    if (columns.has('purgedAt')) {
      rawDb
        .prepare(
          'DELETE FROM `ai-session-entities` WHERE `sessionUuid` IN (SELECT `sessionUuid` FROM `ai-sessions` WHERE `purgedAt` IS NOT NULL)',
        )
        .run();
      rawDb
        .prepare('DELETE FROM `ai-sessions` WHERE `purgedAt` IS NOT NULL')
        .run();
      rawDb.prepare('ALTER TABLE `ai-sessions` DROP COLUMN `purgedAt`').run();
    }
    if (columns.has('summary'))
      rawDb.prepare('ALTER TABLE `ai-sessions` DROP COLUMN `summary`').run();
  },
});
