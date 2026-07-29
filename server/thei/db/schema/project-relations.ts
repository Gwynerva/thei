import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { projects } from './projects';

export type StoredProjectRelationType =
  'related' | 'first-influences-second' | 'second-influences-first';

export type StoredProjectRelationNote =
  | { type: 'shared'; text?: string }
  | {
      type: 'split';
      firstProjectText?: string;
      secondProjectText?: string;
    };

export const projectRelations = sqliteTable(
  'project-relations',
  {
    firstProjectUuid: text()
      .notNull()
      .references(() => projects.projectUuid, { onDelete: 'cascade' }),
    secondProjectUuid: text()
      .notNull()
      .references(() => projects.projectUuid, { onDelete: 'cascade' }),
    type: text().notNull().$type<StoredProjectRelationType>(),
    note: text({ mode: 'json' }).$type<StoredProjectRelationNote | null>(),
    firstSortOrder: integer().notNull(),
    secondSortOrder: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.firstProjectUuid, t.secondProjectUuid] }),
    index('project-relations-first-idx').on(
      t.firstProjectUuid,
      t.firstSortOrder,
    ),
    index('project-relations-second-idx').on(
      t.secondProjectUuid,
      t.secondSortOrder,
    ),
  ],
);
