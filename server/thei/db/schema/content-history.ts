import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  ContentOutputData,
  ContentOwnerType,
  ContentSlot,
} from '#layers/thei/shared/content';
import type {
  ContentHistoryKind,
  ContentHistoryReason,
} from '#layers/thei/shared/content-history';

/**
 * The unsaved draft of a content field and the versions it went through.
 *
 * A field is addressed the way `content` addresses it — owner and slot — with
 * `ownerRef` standing for an owner that does not exist yet as `new~<uuid>`.
 * A field has at most one `draft` row per tab writing it (`writer`). Before
 * a draft is overwritten, the server may retire it into a `revision` instead, so a version is always a
 * former draft or a saved text that was replaced, and nothing else.
 *
 * `data` is canonical, as in `content`: hydration happens when it is read.
 * `assetUuids` lists the files the row refers to, so cleanup keeps them for
 * as long as the row exists.
 */
export const contentHistory = sqliteTable(
  'content-history',
  {
    id: text().primaryKey(),
    ownerType: text().notNull().$type<ContentOwnerType>(),
    ownerRef: text().notNull(),
    slot: text().notNull().$type<ContentSlot>(),
    kind: text().notNull().$type<ContentHistoryKind>(),
    reason: text().$type<ContentHistoryReason>(),
    data: text({ mode: 'json' }).notNull().$type<ContentOutputData>(),
    digest: text().notNull(),
    wordCount: integer().notNull(),
    blockCount: integer().notNull(),
    assetCount: integer().notNull(),
    /** Length of the stored JSON, for the per-field cap. */
    size: integer().notNull(),
    assetUuids: text({ mode: 'json' }).notNull().$type<string[]>(),
    /** The editor session that wrote a draft, to tell two editors apart. */
    writer: text().notNull().default(''),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('content-history-field-idx').on(
      t.ownerType,
      t.ownerRef,
      t.slot,
      t.kind,
      t.createdAt,
    ),
    index('content-history-kind-idx').on(t.kind, t.createdAt),
  ],
);
