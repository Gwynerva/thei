import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

/**
 * What the other end of a relation can be.
 *
 * A relation is always drawn from a project, the one entity structured enough
 * to gather others around it; what it points at can be another project, an
 * event or a diary entry. Pages are deliberately absent: a page belongs to no
 * timeline and relates to nothing.
 */
export const RELATION_ENTITY_TYPES = [
  'project',
  'event',
  'diary-entry',
] as const;
export type RelationEntityType = (typeof RELATION_ENTITY_TYPES)[number];

/**
 * The stored direction of a relation, absolute rather than relative.
 *
 * A row does not know which side is being looked at, so it records the
 * direction between its own two ends; each side translates that into
 * "depends on" or "influences" when it reads the row.
 */
export type StoredRelationType =
  'related' | 'project-influences-entity' | 'entity-influences-project';

export type StoredRelationNote =
  | { type: 'shared'; text?: string }
  | {
      type: 'split';
      projectText?: string;
      entityText?: string;
    };

/**
 * One relation between a project and another entity, stored once.
 *
 * The project end is `projectUuid`; the other end is any entity. Two projects
 * are still one row: the pair is kept with the smaller ID as `projectUuid`, so
 * it cannot be recorded twice from opposite ends. Each side keeps its own sort
 * order so the two entities can list their relations differently.
 */
export const projectRelations = sqliteTable(
  'project-relations',
  {
    projectUuid: text().notNull(),
    entityType: text({ enum: RELATION_ENTITY_TYPES }).notNull(),
    entityId: text().notNull(),
    type: text().notNull().$type<StoredRelationType>(),
    note: text({ mode: 'json' }).$type<StoredRelationNote | null>(),
    projectSortOrder: integer().notNull(),
    entitySortOrder: integer().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.projectUuid, t.entityType, t.entityId],
    }),
    index('project-relations-project-idx').on(
      t.projectUuid,
      t.projectSortOrder,
    ),
    index('project-relations-entity-idx').on(
      t.entityType,
      t.entityId,
      t.entitySortOrder,
    ),
  ],
);
