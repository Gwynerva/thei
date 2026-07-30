import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tags = sqliteTable('tags', {
  tagUuid: text().primaryKey(),
  title: text().notNull(),
  normalizedTitle: text().notNull().unique(),
  slug: text().notNull().unique(),
  publicId: text().notNull().unique(),
  description: text().notNull().default(''),
  accentColor: text(),
});
