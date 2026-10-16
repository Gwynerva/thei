import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import type {
  ContentOwnerType,
  ContentSlot,
} from '#layers/thei/shared/content';

/**
 * The anchors the headings of a text have had, each with the block that had
 * it: what a link to a heading renamed since is mended by. A heading keeps
 * its block through every rename, so the block of an anchor no heading has
 * now names the anchor it has instead.
 *
 * Written whenever a text is saved, from the text it replaces and the one it
 * becomes; a field keeps its newest rows only (`CONTENT_ANCHOR_LIMIT`), and
 * an owner's go with its texts.
 */
export const contentAnchors = sqliteTable(
  'content-anchors',
  {
    ownerType: text().notNull().$type<ContentOwnerType>(),
    ownerId: text().notNull(),
    slot: text().notNull().$type<ContentSlot>(),
    anchor: text().notNull(),
    blockId: text().notNull(),
    /** The heading's words when it had the anchor. */
    title: text().notNull(),
    seenAt: integer().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.ownerType, t.ownerId, t.slot, t.anchor, t.blockId],
    }),
    index('content-anchors-field-idx').on(t.ownerType, t.ownerId, t.slot),
  ],
);
