import { sql } from 'drizzle-orm';
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const logins = sqliteTable(
  'logins',
  {
    ip: text().notNull(),
    loggedAt: text()
      .notNull()
      .default(sql`(current_timestamp)`),
    location: text(),
    device: text(),
  },
  (table) => [
    primaryKey({
      columns: [table.ip, table.loggedAt],
    }),
  ],
);
