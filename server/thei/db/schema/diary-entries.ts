import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

/**
 * A dated thought — the simplest of the three kinds of memory.
 *
 * There is no title and no summary on purpose: an entry is signed by its day
 * wherever it is shown, and its opening lines stand in for a summary. The date
 * is unique, so a day has at most one entry and choosing an occupied day in
 * the admin opens what is already there instead of writing a second one.
 */
export const diaryEntries = sqliteTable(
  'diary-entries',
  {
    diaryUuid: text().primaryKey(),
    /** The day the entry belongs to, `YYYY-MM-DD`. */
    date: text().notNull(),
    access: text().notNull().$type<ProjectEventAccessLevel>(),
    /** Owner-only note to self; flags the entity wherever it is listed. */
    reminder: text().notNull().default(''),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (table) => [uniqueIndex('diary-entries-date-idx').on(table.date)],
);
