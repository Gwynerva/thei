import type { ImageAccent } from '#layers/thei/shared/accent-color';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const externalLinks = sqliteTable('external-links', {
  url: text().primaryKey(),
  title: text(),
  description: text(),
  faviconKey: text().notNull(),
  accent: text({ mode: 'json' }).$type<ImageAccent>(),
  touchedAt: integer().notNull(),
});
