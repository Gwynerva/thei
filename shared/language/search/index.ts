import type { LanguageCode } from '../types';
import { englishSearch } from './en';
import { russianSearch } from './ru';
import {
  LATIN_KEYBOARD,
  type SearchLanguagePack,
  type SearchScript,
} from './types';

export type { SearchLanguagePack, SearchScript } from './types';

/**
 * Bump when a pack reads words differently: an index made with another
 * reading is built again (`server/thei/search/store.ts`).
 */
const PACKS_VERSION = 1;

/** Each language Thei speaks, with what search knows of it. */
const PACKS: Record<LanguageCode, SearchLanguagePack> = {
  en: englishSearch,
  ru: russianSearch,
};

/**
 * Who reads a script when the site's own language does not write in it:
 * English is always there for Latin, so an English word is understood on a
 * site of any language.
 */
const FALLBACK: Record<SearchScript, SearchLanguagePack> = {
  latin: englishSearch,
  cyrillic: russianSearch,
};

const CYRILLIC_WORD = /^[а-я]+$/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const LATIN_WORD = /^[a-z]+(?:['’][a-z]+)?$/u;
const MARKS = /\p{M}+/gu;

export interface SearchWord {
  /** What the word is compared by. */
  term: string;
  /** A word a query does not insist on. */
  stop: boolean;
}

export interface SearchAnalyzer {
  /** Names the reading; part of an index's format. */
  id: string;
  /** A word already normalized (`normalizeTermText`), as search reads it. */
  read(word: string): SearchWord;
  /**
   * The text as typed on the other keyboard of the site's language, when one
   * of its packs has one and the text is all on one side of it.
   */
  otherKeyboard(text: string): string | undefined;
}

/**
 * How search reads words on a site in `language`. Every word goes to the pack
 * of its own script — the site's language where it writes in that script,
 * the fallback otherwise — and a Latin word loses its accents first, so
 * «café» is «cafe»; a Cyrillic one keeps «й». A word of another script, or
 * with digits in it, is compared as it is.
 */
export function createSearchAnalyzer(language: LanguageCode): SearchAnalyzer {
  const own = PACKS[language];
  const packFor = (script: SearchScript) =>
    own.script === script ? own : FALLBACK[script];
  const latin = packFor('latin');
  const cyrillic = packFor('cyrillic');
  const keyboard = own.keyboard ?? cyrillic.keyboard;
  const toLocal = new Map<string, string>();
  const toLatin = new Map<string, string>();
  if (keyboard)
    [...LATIN_KEYBOARD].forEach((key, at) => {
      toLocal.set(key, keyboard[at]!);
      toLatin.set(keyboard[at]!, key);
    });

  return {
    id: `${PACKS_VERSION}:${language}`,
    read(word) {
      if (CYRILLIC_WORD.test(word))
        return { term: cyrillic.stem(word), stop: cyrillic.stopWords.has(word) };
      if (LATIN_LETTER.test(word)) {
        const bare = word.normalize('NFD').replace(MARKS, '').normalize('NFC');
        if (LATIN_WORD.test(bare))
          return { term: latin.stem(bare), stop: latin.stopWords.has(bare) };
        return { term: bare, stop: false };
      }
      return { term: word, stop: false };
    },
    otherKeyboard(text) {
      if (!toLocal.size) return undefined;
      // Digits and spaces are the same on both; the letters decide the side.
      const letters = [...text].filter((char) => /\p{L}/u.test(char));
      if (!letters.length) return undefined;
      const map = letters.every((char) => toLocal.has(char))
        ? toLocal
        : letters.every((char) => toLatin.has(char))
          ? toLatin
          : undefined;
      if (!map) return undefined;
      return [...text].map((char) => map.get(char) ?? char).join('');
    },
  };
}
