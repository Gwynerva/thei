import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AccessLevel } from '#layers/thei/shared/access-level';
import type { EventEmotion } from '#layers/thei/shared/event';

export const events = sqliteTable('events', {
  eventId: text().primaryKey(),
  title: text().notNull(),
  emotion: text().$type<EventEmotion>(),
  access: text().notNull().$type<AccessLevel>(),
  url: text().notNull().unique(),
});
