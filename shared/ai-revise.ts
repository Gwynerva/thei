/**
 * The words of a text edit an AI proposes: what kind of mistake a correction
 * fixes, and how a new order of the owner's own blocks is described.
 */

export const PROOFREAD_CATEGORIES = [
  'spelling',
  'grammar',
  'punctuation',
  'case',
  'missing-letter',
  /** A mention made a link to an entity of the site; the words stay. */
  'link',
] as const;
export type ProofreadCategory = (typeof PROOFREAD_CATEGORIES)[number];

/**
 * Tidying a text: putting the owner's own blocks in order — moved, a
 * paragraph split between topics, a literal repeat dropped, a heading added —
 * and comments on what could be better. It never rewrites a word: every piece
 * of the tidied text is a piece of the text as it was, except its headings.
 */
export const TIDY_COMMENT_KINDS = [
  'repeat',
  'unclear',
  'missing',
  'contradiction',
  'structure',
  'idea',
] as const;
export type TidyCommentKind = (typeof TIDY_COMMENT_KINDS)[number];

/** Why a piece of the text would go: the model's word, and what it repeats. */
export interface TidyRemoval {
  reason: string;
  /** The item of the tidied text it repeats. */
  duplicateOf?: number;
}

/**
 * One item of a tidied text, in order. `from` is a block's place in the text
 * as the model read it; `keys` of the payload say what each of those was.
 * A removed item stands where it would return if the owner kept it.
 */
export type TidyItem =
  | { type: 'block'; from: number; removed?: TidyRemoval }
  | {
      type: 'part';
      from: number;
      /** Where the piece starts in the block's markup. */
      offset: number;
      html: string;
      removed?: TidyRemoval;
    }
  | { type: 'heading'; text: string; level: 2 | 3 }
  | { type: 'delimiter' };

export interface TidyComment {
  /** The item of the tidied text it is about; none for the text as a whole. */
  at?: number;
  /** The words it points at, inside that item. */
  quote?: string;
  kind: TidyCommentKind;
  comment: string;
}

export const TIDY_COMMENTS_MAX = 20;
export const TIDY_COMMENT_MAX = 500;
export const TIDY_HEADING_MAX = 120;
