import { defineMigration } from './types';

/**
 * What a built-in check looked at keeps the session whose run looked at it,
 * so a session counts only what it looked at itself — never another run's,
 * nor what a fix applied in a form left looked at. What was looked at
 * before has none, and counts in no session.
 */
export default defineMigration({
  id: '0.0.7/002-check-coverage-session',
  version: '0.0.7',
  title: {
    en: 'Count what each AI check session looked at',
    ru: 'Считать, что просмотрела каждая сессия проверки ИИ',
  },
  up({ rawDb }) {
    const columns = rawDb
      .prepare("PRAGMA table_info('ai-template-coverage')")
      .all() as { name: string }[];
    if (!columns.some((column) => column.name === 'sessionUuid'))
      rawDb
        .prepare('ALTER TABLE `ai-template-coverage` ADD `sessionUuid` text')
        .run();
  },
});
