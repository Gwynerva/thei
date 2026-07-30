import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { TagContainerType } from '#layers/thei/shared/tag';

export const tagUsages = sqliteTable(
  'tag-usages',
  {
    tagUuid: text().notNull(),
    containerType: text().notNull().$type<TagContainerType>(),
    containerId: text().notNull(),
    sortOrder: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tagUuid, t.containerType, t.containerId] }),
    index('tag-usages-container-idx').on(t.containerType, t.containerId),
    index('tag-usages-tag-idx').on(t.tagUuid),
  ],
);
