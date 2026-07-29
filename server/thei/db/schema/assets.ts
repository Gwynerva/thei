import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import type { AssetType, AssetMeta } from '#layers/thei/shared/asset';
import type { AssetUploadSettings } from '#layers/thei/shared/asset-upload-settings';

export type { AssetMeta };

export const assets = sqliteTable(
  'assets',
  {
    assetUuid: text().primaryKey(),
    /** Random URL token embedded in container-scoped serving URLs for cache busting. */
    slug: text().notNull().unique(),
    extension: text().notNull(),
    /** Stable identifier shared by independently stored variants of one asset. */
    familyUuid: text().notNull(),
    /** SHA-256 of the bytes actually stored on disk. */
    contentHash: text().notNull(),
    /** Stable key derived from the settings that produced this exact file. */
    settingsKey: text().notNull(),
    /** Version of the settings schema used to build settingsKey/settings. */
    settingsVersion: integer().notNull(),
    /** JSON settings that produced this asset. Null only for internal helper assets. */
    settings: text({ mode: 'json' }).$type<AssetUploadSettings | null>(),
    type: text().notNull().$type<AssetType>(),
    size: integer().notNull(),
    /** Unix ms timestamp (Date.now()). Reset on dedup hit to push back orphan cleanup. */
    touchedAt: integer().notNull(),
    /** JSON metadata computed at upload time (e.g. dominant color hue). Nullable for pre-existing assets. */
    meta: text({ mode: 'json' }).$type<AssetMeta | null>(),
  },
  (t) => [
    uniqueIndex('assets_family_content_settings_idx').on(
      t.familyUuid,
      t.contentHash,
      t.settingsKey,
    ),
    index('assets_family_idx').on(t.familyUuid),
  ],
);
