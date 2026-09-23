import { index, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const STATUS_OWNER_TYPES = ['profile', 'project'] as const;
export type StatusOwnerType = (typeof STATUS_OWNER_TYPES)[number];

/**
 * A dated line about how something is going right now.
 *
 * The owner is polymorphic because the life of a project has the same shape as
 * the life of the person: a dated history, newest first. The profile keeps the
 * one it always had; a project gets its own.
 *
 * `STATUS_OWNER_TYPES` repeats the one in `shared/status.ts` on purpose: the
 * schema is also loaded by drizzle-kit, which only sees type imports erased.
 */
export const statuses = sqliteTable(
  'statuses',
  {
    id: text().primaryKey(),
    ownerType: text({ enum: STATUS_OWNER_TYPES }).notNull(),
    ownerId: text().notNull(),
    kind: text({ enum: ['regular', 'empty'] })
      .notNull()
      .default('regular'),
    assetUuid: text(),
    text: text().notNull(),
    createdAt: integer().notNull(),
  },
  (t) => [
    index('statuses-owner-date-idx').on(
      t.ownerType,
      t.ownerId,
      t.createdAt,
      t.id,
    ),
  ],
);
