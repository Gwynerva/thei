import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

/**
 * What a relation can join.
 *
 * All three kinds stand on their own and all three carry relations, so none
 * is privileged as "the one that points". Pages are deliberately absent: a
 * page belongs to no timeline and relates to nothing.
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
  'related' | 'first-influences-second' | 'second-influences-first';

export type StoredRelationNote =
  | { type: 'shared'; text?: string }
  | {
      type: 'split';
      firstText?: string;
      secondText?: string;
    };

/**
 * One relation between two entities, stored once.
 *
 * The pair is kept in a canonical order so a relation cannot be recorded
 * twice from opposite ends, and each side keeps its own sort order so the two
 * entities can list their relations differently.
 */
export const entityRelations = sqliteTable(
  'entity-relations',
  {
    firstType: text({ enum: RELATION_ENTITY_TYPES }).notNull(),
    firstId: text().notNull(),
    secondType: text({ enum: RELATION_ENTITY_TYPES }).notNull(),
    secondId: text().notNull(),
    type: text().notNull().$type<StoredRelationType>(),
    note: text({ mode: 'json' }).$type<StoredRelationNote | null>(),
    firstSortOrder: integer().notNull(),
    secondSortOrder: integer().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.firstType, t.firstId, t.secondType, t.secondId],
    }),
    index('entity-relations-first-idx').on(
      t.firstType,
      t.firstId,
      t.firstSortOrder,
    ),
    index('entity-relations-second-idx').on(
      t.secondType,
      t.secondId,
      t.secondSortOrder,
    ),
  ],
);
