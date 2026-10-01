import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { events } from './events';
import { externalLinks } from './external-links';

export const eventExternalLinks = sqliteTable(
  'event-external-links',
  {
    eventUuid: text()
      .notNull()
      .references(() => events.eventUuid, { onDelete: 'cascade' }),
    url: text()
      .notNull()
      .references(() => externalLinks.url),
    sortOrder: integer().notNull(),
    isPrivate: integer({ mode: 'boolean' }).notNull().default(false),
    /** The owner's word on why the link is there; empty when there is none. */
    note: text().notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.eventUuid, t.url] }),
    index('event-external-links-event-idx').on(t.eventUuid, t.sortOrder),
  ],
);
