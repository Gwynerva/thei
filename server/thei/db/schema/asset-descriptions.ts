import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * What a file is, said in words: its description (in the owner's words
 * «Расшифровка», the `alt` of a picture) — what is in a picture, what a
 * recording is and what it is about, what a document says it is. Not the
 * text of a document nor a transcript of speech: a sentence or a few, for
 * models, for search and for whoever cannot see the file.
 *
 * One per family: the original and every variant made of it show the same
 * thing. A row lives as long as a row of `assets` of its family does, and
 * goes with the last one (`forgetFamilyDescription`). Stored as typed.
 */
export const assetDescriptions = sqliteTable('asset-descriptions', {
  familyUuid: text().primaryKey(),
  text: text().notNull(),
  /** Unix ms of the last change: the version a form saves against. */
  updatedAt: integer().notNull(),
});
