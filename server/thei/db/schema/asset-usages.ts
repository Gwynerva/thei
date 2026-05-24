import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AssetContainerType, AssetRole } from '#layers/thei/shared/asset';

export const assetUsages = sqliteTable(
  'asset-usages',
  {
    assetUuid: text().notNull(),
    containerType: text().notNull().$type<AssetContainerType>(),
    containerId: text().notNull(),
    role: text().notNull().$type<AssetRole>(),
  },
  (t) => [
    primaryKey({
      columns: [t.assetUuid, t.containerType, t.containerId, t.role],
    }),
    index('asset-usages-container-idx').on(t.containerType, t.containerId),
    index('asset-usages-asset-idx').on(t.assetUuid),
  ],
);
