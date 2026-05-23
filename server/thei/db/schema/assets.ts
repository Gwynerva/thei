import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { AssetType } from '#layers/thei/shared/asset';

export const assets = sqliteTable(
  'assets',
  {
    assetUuid: text().primaryKey(),
    /** Random URL token — embedded in container-scoped serving URLs for cache busting. */
    link: text().notNull().unique(),
    extension: text().notNull(),
    profileId: text().notNull(),
    /** SHA-256 of the original file before any processing. Used for deduplication together with profileId. */
    rawHash: text().notNull(),
    type: text().notNull().$type<AssetType>(),
    size: integer().notNull(),
    /** Unix ms timestamp (Date.now()). Reset on dedup hit to push back orphan cleanup. */
    touchedAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex('assets_rawHash_profileId_idx').on(t.rawHash, t.profileId),
  ],
);
