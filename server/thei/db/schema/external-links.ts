import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const externalLinks = sqliteTable('external-links', {
  url: text().primaryKey(),
  title: text(),
  description: text(),
  faviconKey: text().notNull(),
  accentHue: integer(),
  touchedAt: integer().notNull(),
});
