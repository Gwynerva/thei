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
  // What reads as a mistake of meaning rather than of letters:
  /** A fact said again, as though by mistake. */
  'repeat',
  /** A step of reasoning that does not follow. */
  'logic',
  /** The text says otherwise elsewhere. */
  'contradiction',
  /** Words so tangled a reader stumbles. */
  'clumsy',
] as const;
export type ProofreadCategory = (typeof PROOFREAD_CATEGORIES)[number];

/**
 * The mistakes of meaning: never sure, since only the author knows what was
 * meant. Each is a remark on the words — with a way to say them otherwise,
 * when the model has one, which may reword more than a local fix would.
 */
export const MEANING_CATEGORIES = [
  'repeat',
  'logic',
  'contradiction',
  'clumsy',
] as const satisfies readonly ProofreadCategory[];
export type MeaningCategory = (typeof MEANING_CATEGORIES)[number];

export function isMeaningCategory(
  category: string,
): category is MeaningCategory {
  return (MEANING_CATEGORIES as readonly string[]).includes(category);
}

/** The most a remark on meaning or its rewording takes in, in characters. */
export const MEANING_FIND_MAX = 400;

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
