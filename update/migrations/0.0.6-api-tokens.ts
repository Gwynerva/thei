import { defineMigration } from './types';

/**
 * Tokens that let an AI client work with the site over MCP.
 *
 * The table starts empty and stays unused until the owner creates the first
 * token. A token keeps only its hash.
 */
export default defineMigration({
  id: '0.0.6/001-api-tokens',
  version: '0.0.6',
  title: {
    en: 'Add tokens for AI clients',
    ru: 'Добавление токенов для ИИ-клиентов',
  },
  description: {
    en: 'Creates the table for MCP access tokens.',
    ru: 'Создаёт таблицу для токенов доступа по MCP.',
  },
  up({ rawDb }) {
    rawDb
      .prepare(
        'CREATE TABLE IF NOT EXISTS `api-tokens` (' +
          '`tokenUuid` text PRIMARY KEY NOT NULL, ' +
          '`label` text NOT NULL, ' +
          '`tokenHash` text NOT NULL, ' +
          '`scopes` text NOT NULL, ' +
          '`createdAt` integer NOT NULL, ' +
          '`lastUsedAt` integer, ' +
          '`lastClient` text' +
          ')',
      )
      .run();
    rawDb
      .prepare(
        'CREATE UNIQUE INDEX IF NOT EXISTS `api-tokens_tokenHash_unique` ON `api-tokens` (`tokenHash`)',
      )
      .run();
  },
});
