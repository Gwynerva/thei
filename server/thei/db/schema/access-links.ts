import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * One-time links that sign the owner in on another device.
 *
 * Only the hash of the token is stored, so a copy of the database never
 * yields a working link. A row is deleted the moment it is used, which is what
 * makes the link one-time; expired rows are swept in the background.
 */
export const signInLinks = sqliteTable(
  'sign-in-links',
  {
    tokenHash: text().primaryKey(),
    createdAt: integer().notNull(),
    expiresAt: integer().notNull(),
    /** Where the link was created, so the list is recognisable. */
    createdFrom: text(),
  },
  (t) => [index('sign-in-links-expires-idx').on(t.expiresAt)],
);

/**
 * Temporary links that open one private project, event or page, and nothing
 * else.
 *
 * The token grants the private view of exactly the entity named here, for as
 * long as the row lives. Revoking is deleting the row, so a link that leaked
 * stops working at once, and an expired one stops working on its own.
 */
export const shareLinks = sqliteTable(
  'share-links',
  {
    shareUuid: text().primaryKey(),
    tokenHash: text().notNull().unique(),
    /**
     * `project`, `event` or `page`; a stage or a section is shared with its
     * project.
     */
    entityType: text()
      .notNull()
      .$type<'project' | 'event' | 'page' | 'diary-entry'>(),
    entityUuid: text().notNull(),
    createdAt: integer().notNull(),
    expiresAt: integer().notNull(),
  },
  (t) => [
    index('share-links-entity-idx').on(t.entityType, t.entityUuid),
    index('share-links-expires-idx').on(t.expiresAt),
  ],
);
