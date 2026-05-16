import { sql } from 'drizzle-orm';
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const signIns = sqliteTable(
  'sign_ins',
  {
    ip: text().notNull(),
    at: text()
      .notNull()
      .default(sql`(current_timestamp)`),
    location: text(),
    ua: text(),
  },
  (table) => [
    primaryKey({
      columns: [table.ip, table.at],
    }),
  ],
);
