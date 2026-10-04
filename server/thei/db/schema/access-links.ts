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
 * Temporary links that open one private project, event, page or diary entry,
 * and nothing else.
 *
 * The token grants the private view of exactly the entity named here, for as
 * long as the row lives. Revoking is deleting the row, so a link that leaked
 * stops working at once, and an expired one stops working on its own.
 */
export const shareLinks = sqliteTable(
  'share-links',
  {
    shareUuid: text().primaryKey(),
    /**
     * Kept as is, unlike a sign-in link's hash, so the owner can copy the
     * address again at any time. A link only opens what the same database
     * already holds, for a day at most; a sign-in link opens the whole site.
     */
    token: text().notNull().unique(),
    /**
     * `project`, `event`, `page` or `diary-entry`; a section is
     * shared with its project.
     */
    entityType: text()
      .notNull()
      .$type<'project' | 'event' | 'page' | 'diary-entry'>(),
    entityUuid: text().notNull(),
    /** Who the link was made for, in the owner's words. */
    label: text().notNull().default(''),
    createdAt: integer().notNull(),
    /**
     * When the link was last extended: the start of its current term, which
     * the owner's countdown is measured against. `null` until the first
     * extension, when the term started with `createdAt`.
     */
    extendedAt: integer(),
    expiresAt: integer().notNull(),
  },
  (t) => [
    index('share-links-entity-idx').on(t.entityType, t.entityUuid),
    index('share-links-expires-idx').on(t.expiresAt),
  ],
);
