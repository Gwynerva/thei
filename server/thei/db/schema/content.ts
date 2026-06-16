import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type {
  ContentOutputData,
  ContentOwnerType,
  ContentSlot,
} from '#layers/thei/shared/content';

export const content = sqliteTable(
  'content',
  {
    contentUuid: text().primaryKey(),
    ownerType: text().notNull().$type<ContentOwnerType>(),
    ownerId: text().notNull(),
    slot: text().notNull().$type<ContentSlot>(),
    data: text({ mode: 'json' }).notNull().$type<ContentOutputData>(),
    blockCount: integer().notNull().default(0),
    assetCount: integer().notNull().default(0),
    assetTotalSize: integer().notNull().default(0),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex('content-owner-slot-idx').on(t.ownerType, t.ownerId, t.slot),
    index('content-owner-idx').on(t.ownerType, t.ownerId),
  ],
);
