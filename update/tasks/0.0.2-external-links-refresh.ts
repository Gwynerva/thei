import { defineUpdateTask } from './types';

/**
 * External links used to be read by a library that has since been replaced,
 * and their icons were once left out of backups. Every stored site is read
 * again with the engine's own reader, five at a time, so titles, favicons
 * and accents match what a newly added link gets. A site that cannot be
 * read now keeps what it said before.
 */
export default defineUpdateTask({
  id: '0.0.2/002-external-links-refresh',
  version: '0.0.2',
  title: {
    en: 'Refresh external link details',
    ru: 'Обновление данных внешних ссылок',
  },
  description: {
    en: 'Every linked site is read again, a few at a time, for its current title, description and icon. A site that cannot be reached keeps what was stored.',
    ru: 'Каждый сайт из ссылок читается заново, по несколько за раз: название, описание и значок. Недоступный сайт сохраняет прежние данные.',
  },
  progress: (done, total) => ({
    en: `${done} of ${total} links`,
    ru: `${done} из ${total} ссылок`,
  }),
  async run({ progress }) {
    const { refreshStoredExternalLinks } =
      await import('#layers/thei/server/thei/external-links/refresh-stored');
    await refreshStoredExternalLinks({ onProgress: progress });
  },
});
