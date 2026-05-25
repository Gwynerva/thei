import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { AssetType } from '#layers/thei/shared/asset';

export interface AssetMeta {
  /** OKLCH hue (0–359) of the dominant color, extracted at upload time. Only set for raster images. */
  dominantHue?: number;
}

export const assets = sqliteTable(
  'assets',
  {
    assetUuid: text().primaryKey(),
    /** Random URL token — embedded in container-scoped serving URLs for cache busting. */
    slug: text().notNull().unique(),
    extension: text().notNull(),
    profileId: text().notNull(),
    /** SHA-256 of the original file before any processing. Used for deduplication together with profileId. */
    rawHash: text().notNull(),
    type: text().notNull().$type<AssetType>(),
    size: integer().notNull(),
    /** Unix ms timestamp (Date.now()). Reset on dedup hit to push back orphan cleanup. */
    touchedAt: integer().notNull(),
    /** JSON metadata computed at upload time (e.g. dominant color hue). Nullable for pre-existing assets. */
    meta: text({ mode: 'json' }).$type<AssetMeta | null>(),
  },
  (t) => [
    uniqueIndex('assets_rawHash_profileId_idx').on(t.rawHash, t.profileId),
  ],
);
