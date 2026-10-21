import { defineMigration, type MigrationContext } from './types';

/** Adds a column, as the release writes it, to a table that lacks it. */
function addColumn(
  rawDb: MigrationContext['rawDb'],
  table: string,
  definition: string,
) {
  const name = /^`([^`]+)`/.exec(definition)![1]!;
  const columns = rawDb.prepare(`PRAGMA table_info('${table}')`).all() as {
    name: string;
  }[];
  if (!columns.some((column) => column.name === name))
    rawDb.prepare(`ALTER TABLE \`${table}\` ADD ${definition}`).run();
}

/**
 * A session of the site's own model keeps what every turn of it is sent
 * before the conversation, so the conversation only ever grows: a model's
 * thinking is bound to what came before it, and is refused once that
 * changed. Sessions begun before have none, and keep the next one they are
 * sent. An action keeps the model's own words once the owner corrected
 * them.
 */
export default defineMigration({
  id: '0.0.7/001-ai',
  version: '0.0.7',
  title: {
    en: 'Keep AI conversations as they were sent',
    ru: 'Сохранять переписку с ИИ такой, какой она ушла',
  },
  description: {
    en: 'A session remembers what its model was sent, so a conversation can go on; a proposal remembers the model’s words when you correct them.',
    ru: 'Сессия помнит, что было отправлено её модели, и разговор можно продолжать; предложение помнит слова модели, если вы их поправили.',
  },
  up({ rawDb }) {
    addColumn(rawDb, 'ai-sessions', '`context` text');
    addColumn(rawDb, 'ai-actions', '`proposed` text');
  },
});
