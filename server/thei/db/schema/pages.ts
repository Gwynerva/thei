import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

export const pages = sqliteTable('pages', {
  pageUuid: text().primaryKey(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  summary: text().notNull(),
  access: text().notNull().$type<ProjectEventAccessLevel>(),
  /** Owner-only note to self; flags the entity wherever it is listed. */
  reminder: text().notNull().default(''),
  /** Other names it is found by in every search; never shown on a page. */
  synonyms: text({ mode: 'json' }).notNull().$type<string[]>().default([]),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});
