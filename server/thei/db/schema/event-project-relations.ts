import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { events } from './events';
import { projects } from './projects';

export const eventProjectRelations = sqliteTable(
  'event-project-relations',
  {
    eventUuid: text()
      .notNull()
      .references(() => events.eventUuid, { onDelete: 'cascade' }),
    projectUuid: text()
      .notNull()
      .references(() => projects.projectUuid, { onDelete: 'cascade' }),
    note: text(),
    sortOrder: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventUuid, t.projectUuid] }),
    index('event-project-relations-event-idx').on(t.eventUuid, t.sortOrder),
    index('event-project-relations-project-idx').on(t.projectUuid),
  ],
);
