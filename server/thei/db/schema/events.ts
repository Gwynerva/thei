import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { EventEmotion } from '#layers/thei/shared/event';

export const events = sqliteTable('events', {
  eventId: text().primaryKey(),
  title: text().notNull(),
  emotion: text().$type<EventEmotion>(),
  access: text().notNull().$type<ProjectEventAccessLevel>(),
  url: text().notNull().unique(),
});
