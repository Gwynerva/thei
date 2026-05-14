import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AccessLevel } from '#layers/thei/shared/access-level';

export const projects = sqliteTable('projects', {
  projectId: text().primaryKey(),
  title: text().notNull(),
  summary: text().notNull(),
  access: text().notNull().$type<AccessLevel>(),
  url: text().notNull().unique(),
});
