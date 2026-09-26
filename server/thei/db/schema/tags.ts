import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tags = sqliteTable('tags', {
  tagUuid: text().primaryKey(),
  title: text().notNull(),
  normalizedTitle: text().notNull().unique(),
  slug: text().notNull().unique(),
  publicId: text().notNull().unique(),
  description: text().notNull().default(''),
  /** Other words the tag is known by. Only the owner sees them. */
  synonyms: text({ mode: 'json' }).notNull().$type<string[]>().default([]),
});
