import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { AdminSessionData } from '../../admin-session';

export const adminSessions = sqliteTable('admin-sessions', {
  sessionUuid: text().primaryKey(),
  data: text({ mode: 'json' }).notNull().$type<AdminSessionData>(),
});
