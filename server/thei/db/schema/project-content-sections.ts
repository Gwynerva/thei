import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const projectContentSections = sqliteTable(
  'project-content-sections',
  {
    sectionUuid: text().primaryKey(),
    projectUuid: text().notNull(),
    title: text().notNull(),
    summary: text().notNull().default(''),
    humanReadableSlug: text().notNull(),
    publicId: text().notNull(),
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
    uniqueIndex('project-content-sections-public-id-unique').on(t.publicId),
  ],
);

export const projectStages = sqliteTable(
  'project-stages',
  {
    stageUuid: text().primaryKey(),
    projectUuid: text().notNull(),
    title: text().notNull(),
    summary: text().notNull().default(''),
    humanReadableSlug: text().notNull(),
    publicId: text().notNull(),
    isPrivate: integer({ mode: 'boolean' }).notNull().default(false),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('project-stages-project-idx').on(t.projectUuid),
    uniqueIndex('project-stages-public-id-unique').on(t.publicId),
  ],
);
