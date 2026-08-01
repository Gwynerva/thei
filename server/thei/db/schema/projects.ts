import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { ProjectActionEditData } from '#layers/thei/shared/project-action';

export const projects = sqliteTable('projects', {
  projectUuid: text().primaryKey(),
  title: text().notNull(),
  summary: text().notNull(),
  access: text().notNull().$type<ProjectEventAccessLevel>(),
  humanReadableSlug: text().notNull(),
  publicId: text().notNull().unique(),
  showcase: integer({ mode: 'boolean' }).notNull().default(false),
  cv: integer({ mode: 'boolean' }).notNull().default(false),
  action: text({ mode: 'json' }).$type<ProjectActionEditData>(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});
