import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AssetAccessLevel } from '#layers/thei/shared/access-level';
import type { AssetType } from '#layers/thei/shared/asset';

export const assets = sqliteTable('assets', {
  assetId: text().primaryKey(),
  access: text().notNull().$type<AssetAccessLevel>(),
  url: text().notNull().unique(),
  type: text().notNull().$type<AssetType>(),
  size: integer().notNull(),
  hash: text().notNull().unique(),
  uploadedAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
});
