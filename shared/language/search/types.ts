/**
 * What search knows of a language: how its words are reduced to one form,
 * which of them only hold a sentence together, and how its keyboard lies over
 * the Latin one.
 *
 * A pack is chosen for each word by the script it is written in, not by the
 * site's language: a Russian diary that says «release» reads it as English,
 * so an archive written in several languages is searched whole. The site's
 * language only decides which pack a script goes to when several languages
 * share it (`shared/language/search/index.ts`).
 */
export type SearchScript = 'latin' | 'cyrillic';

export interface SearchLanguagePack {
  /** Whether a normalized word is written in this pack's script. */
  script: SearchScript;
  /** The one form a normalized word of the language stands for. */
  stem(word: string): string;
  /**
   * Words that hold a sentence together and say nothing of what a text is
   * about: a query does not insist on them. Normalized, as typed.
   */
  stopWords: ReadonlySet<string>;
  /**
   * The language's keyboard, key for key over `LATIN_KEYBOARD`: what a word
   * typed on the wrong layout was meant to be. None for a Latin language.
   */
  keyboard?: string;
  /**
   * A Latin word as this language writes it: «EVA» is «ева», «Blender» is
   * «блендер». A word of a text is also found by it, so a query in this
   * language's letters meets a name the text spells in Latin ones.
   */
  fromLatin?(word: string): string;
}

/**
 * The keys of a Latin keyboard that type letters on other layouts, in the
 * order their packs list their own letters.
 */
export const LATIN_KEYBOARD = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.";
