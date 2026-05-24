import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

export const projects = sqliteTable('projects', {
  projectUuid: text().primaryKey(),
  title: text().notNull(),
  summary: text().notNull(),
  access: text().notNull().$type<ProjectEventAccessLevel>(),
  slug: text().notNull().unique(),
  important: integer({ mode: 'boolean' }).notNull().default(false),
  cv: integer({ mode: 'boolean' }).notNull().default(false),
});
