import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * What an excerpt may be a part of. A copy of `EXCERPT_PARENT_TYPES` in
 * `shared/excerpt.ts`: the schema is read by the baseline script outside the
 * app, where the layer's aliases do not resolve.
 */
export const EXCERPT_PARENT_TYPES = [
  'diary-entry',
  'event',
  'project',
] as const;

/**
 * An excerpt: a named part of a diary entry, an event or a project — a
 * title, a text and what it is about — with a page of its own. Its body is
 * a row of `content` (slot `excerpt-body`), its banner a placement of the
 * `banner` role on it, and what it is about are ordinary rows of
 * `entity-relations` with the excerpt as one end. The parent's form holds
 * its excerpts in `sortOrder`, as a project's holds its sections.
 */
export const excerpts = sqliteTable(
  'excerpts',
  {
    excerptUuid: text().primaryKey(),
    parentType: text({ enum: EXCERPT_PARENT_TYPES }).notNull(),
    parentId: text().notNull(),
    title: text().notNull(),
    summary: text().notNull().default(''),
    humanReadableSlug: text().notNull(),
    publicId: text().notNull(),
    isPrivate: integer({ mode: 'boolean' }).notNull().default(false),
    sortOrder: integer().notNull(),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('excerpts-parent-idx').on(t.parentType, t.parentId, t.sortOrder),
    uniqueIndex('excerpts-public-id-unique').on(t.publicId),
  ],
);
