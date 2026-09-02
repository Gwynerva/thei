import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

export const pages = sqliteTable('pages', {
  pageUuid: text().primaryKey(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  summary: text().notNull(),
  access: text().notNull().$type<ProjectEventAccessLevel>(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});
