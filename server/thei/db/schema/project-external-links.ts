import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { projects } from './projects';
import { externalLinks } from './external-links';

export const projectExternalLinks = sqliteTable(
  'project-external-links',
  {
    projectUuid: text()
      .notNull()
      .references(() => projects.projectUuid, { onDelete: 'cascade' }),
    url: text()
      .notNull()
      .references(() => externalLinks.url),
    name: text().notNull(),
    sortOrder: integer().notNull(),
    isPrivate: integer({ mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.projectUuid, table.url] }),
    index('project-external-links-project-idx').on(
      table.projectUuid,
      table.sortOrder,
    ),
  ],
);
