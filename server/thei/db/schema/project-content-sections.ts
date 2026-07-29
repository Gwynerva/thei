import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const projectContentSections = sqliteTable(
  'project-content-sections',
  {
    sectionUuid: text().primaryKey(),
    projectUuid: text().notNull(),
    title: text().notNull(),
    summary: text().notNull().default(''),
    isPrivate: integer({ mode: 'boolean' }).notNull().default(false),
    sortOrder: integer().notNull(),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('project-content-sections-project-idx').on(
      t.projectUuid,
      t.sortOrder,
    ),
  ],
);

export const projectContentSectionPeriods = sqliteTable(
  'project-content-section-periods',
  {
    sectionUuid: text().notNull(),
    startDate: text().notNull(),
    endDate: text().notNull(),
    sortOrder: integer().notNull(),
  },
  (t) => [
    index('project-content-section-periods-section-idx').on(
      t.sectionUuid,
      t.sortOrder,
    ),
  ],
);
