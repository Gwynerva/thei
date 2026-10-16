import type { AiEntityOffer } from './ai-entity';

/**
 * A file's description — «Расшифровка» in the owner's Russian, "Description"
 * in English, the `alt` of a picture: what the file is, in words. What a
 * picture shows (its text retold, not copied out), what a recording is and
 * what it is about, what a video shows, what a document or an archive is.
 * Not the text of a document, not a transcript of speech: a sentence or a
 * few. One is kept per family of a file — the original and its variants —
 * and read by models, by search and by whoever cannot see the file.
 */

/** The longest description kept, in characters. */
export const ASSET_DESCRIPTION_MAX = 1000;

/** A file's description and the version a save is made against. */
export interface AssetDescription {
  text: string;
  /** When it last changed; `null` while the file has none. */
  updatedAt: number | null;
}

/**
 * What the description field reads: the description, and — with AI on —
 * what an AI proposes for it, waiting at its label.
 */
export interface AssetDescriptionResponse extends AssetDescription {
  offers?: AiEntityOffer[];
}

/** What a save sends: the words, and the version they were written over. */
export interface AssetDescriptionSave {
  text: string;
  expectedUpdatedAt: number | null;
}

/** A description as it is kept: as typed, without the space around it. */
export function cleanAssetDescription(text: string): string {
  return text.trim();
}
