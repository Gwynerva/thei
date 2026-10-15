import { asc, eq } from 'drizzle-orm';
import {
  AI_TERM_DISPLAY_MAX,
  AI_TERM_NOTE_MAX,
  type AiTerm,
} from '#layers/thei/shared/ai';
import type { AiTermItem } from '#layers/thei/shared/ai-memory';
import {
  containsPhrase,
  normalizeTermText,
  stemTerm,
  wordTokens,
} from '#layers/thei/shared/text-terms';
import { refuse as fail } from '../entity-patch/text';
import { loadDocuments, type McpDocument } from '../mcp/documents';

/**
 * The owner's dictionary: names, places and their own words — what a model
 * would otherwise «correct», or not know. A word's note is read only where
 * the word is: with a text that has it. One kept as written is left alone by
 * proofreading.
 *
 * A word is found in a text whole, as it is written or in one of the forms
 * the owner listed; a single word of four letters or more is also found in
 * its other forms, by its stem — «Кузова» in «на Кузовах».
 */

const TERM_FORMS_MAX = 12;
/** Shorter words are found only as written: a stem of three letters is noise. */
const STEMMED_FROM = 4;

/** How a word is looked up: case, compatibility forms and «ё» set aside. */
export function termKey(display: string): string {
  return normalizeTermText(display).replace(/\s+/g, ' ').trim();
}

type TermRow = typeof import('../db/schema/ai').aiTerms.$inferSelect;

function termOf(row: TermRow): AiTerm {
  return {
    word: row.word,
    display: row.display,
    note: row.note,
    forms: row.forms,
    keep: row.keep,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listTerms(): AiTerm[] {
  const { db, schema } = THEI_SERVER.useDb();
  return (
    db
      .select()
      .from(schema.aiTerms)
      .orderBy(asc(schema.aiTerms.word))
      .all() as TermRow[]
  ).map(termOf);
}

export function findTerm(word: string): AiTerm | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select()
    .from(schema.aiTerms)
    .where(eq(schema.aiTerms.word, termKey(word)))
    .get() as TermRow | undefined;
  return row ? termOf(row) : undefined;
}

export interface TermInput {
  display: unknown;
  note?: unknown;
  forms?: unknown;
  keep?: unknown;
}

function cleanTerm(input: TermInput) {
  const display =
    typeof input.display === 'string'
      ? input.display.replace(/\s+/g, ' ').trim()
      : '';
  if (!display) fail('Name the word.');
  if (display.length > AI_TERM_DISPLAY_MAX)
    fail(
      `A word of the dictionary is at most ${AI_TERM_DISPLAY_MAX} characters.`,
    );
  const note =
    typeof input.note === 'string'
      ? input.note.replace(/\s+/g, ' ').trim()
      : '';
  if (note.length > AI_TERM_NOTE_MAX)
    fail(`Its note is at most ${AI_TERM_NOTE_MAX} characters.`);
  const forms = Array.isArray(input.forms)
    ? [
        ...new Set(
          input.forms
            .filter((form): form is string => typeof form === 'string')
            .map((form) => form.replace(/\s+/g, ' ').trim())
            .filter((form) => form && termKey(form) !== termKey(display)),
        ),
      ].slice(0, TERM_FORMS_MAX)
    : [];
  return {
    word: termKey(display),
    display,
    note,
    forms,
    keep: input.keep === undefined ? true : Boolean(input.keep),
  };
}

/**
 * Adds a word, or changes one: `previous` is the word it was, when its
 * spelling changes. Another word of the same spelling is refused.
 */
export function saveTerm(
  input: TermInput,
  previous?: string,
  now = Date.now(),
): AiTerm {
  const term = cleanTerm(input);
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => putTerm(tx, schema, term, previous, now));
  return findTerm(term.word)!;
}

/** A word as it would be kept, checked: what `saveTerm` writes. */
export function checkedTerm(input: TermInput) {
  return cleanTerm(input);
}

/**
 * Writes a checked word inside a transaction, in place of `previous` when
 * its spelling changes; another word of the same spelling is refused.
 */
export function putTerm(
  tx: any,
  schema: any,
  term: ReturnType<typeof cleanTerm>,
  previous: string | undefined,
  now: number,
) {
  const was = previous ? termKey(previous) : undefined;
  const clash = tx
    .select()
    .from(schema.aiTerms)
    .where(eq(schema.aiTerms.word, term.word))
    .get() as TermRow | undefined;
  if (clash && clash.word !== was)
    fail(`«${clash.display}» is in the dictionary already.`);
  const old = was
    ? (tx
        .select()
        .from(schema.aiTerms)
        .where(eq(schema.aiTerms.word, was))
        .get() as TermRow | undefined)
    : undefined;
  if (was && !old) fail('There is no such word in the dictionary.');
  if (old) tx.delete(schema.aiTerms).where(eq(schema.aiTerms.word, was!)).run();
  tx.insert(schema.aiTerms)
    .values({ ...term, createdAt: old?.createdAt ?? now, updatedAt: now })
    .run();
}

export function deleteTerm(word: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const result = db
    .delete(schema.aiTerms)
    .where(eq(schema.aiTerms.word, termKey(word)))
    .run();
  if (!result.changes) fail('There is no such word in the dictionary.');
}

/** What a text has to match a word against, made once per text. */
export function termMatcher(text: string) {
  const normalized = normalizeTermText(text);
  let stems: Set<string> | undefined;
  return (term: Pick<AiTerm, 'word' | 'forms'>) => {
    if (containsPhrase(normalized, term.word)) return true;
    if (term.forms.some((form) => containsPhrase(normalized, termKey(form))))
      return true;
    if (term.word.includes(' ') || term.word.length < STEMMED_FROM)
      return false;
    stems ??= new Set(wordTokens(normalized).map(stemTerm));
    return stems.has(stemTerm(term.word));
  };
}

/** The dictionary's words a text has, with their notes. */
export function termsIn(text: string, terms = listTerms()): AiTerm[] {
  if (!terms.length || !text) return [];
  const matches = termMatcher(text);
  return terms.filter(matches);
}

/**
 * The words of a phrase proofreading must leave as written: those of a word
 * kept as written, in any of its forms.
 */
export function keptWordsIn(phrase: string, terms = listTerms()): string[] {
  const kept = terms.filter((term) => term.keep);
  if (!kept.length || !phrase) return [];
  const tokens = wordTokens(normalizeTermText(phrase));
  const words = new Set<string>();
  for (const term of kept)
    if (term.word.includes(' ')) {
      if (termMatcher(phrase)(term))
        for (const token of wordTokens(term.word)) words.add(token);
    } else
      for (const token of tokens)
        if (termMatcher(token)(term)) words.add(token);
  return tokens.filter((token) => words.has(token));
}

/** The words a model reads with a text, as a section of what it reads. */
export function termLines(text: string): string[] {
  const found = termsIn(text);
  if (!found.length) return [];
  return [
    '',
    "## Words of the owner's dictionary in it",
    '',
    ...found.map(
      (term) =>
        `- ${term.display}${term.keep ? ' (keep as written)' : ''}${term.note ? ` — ${term.note}` : ''}`,
    ),
  ];
}

/**
 * Each document's words as a word of the dictionary is looked for in them,
 * made once while the document is the one kept: a new read of the archive
 * makes new documents, and their own matchers.
 */
const documentMatchers = new WeakMap<
  McpDocument,
  ReturnType<typeof termMatcher>
>();

function matcherOf(document: McpDocument) {
  let matcher = documentMatchers.get(document);
  if (!matcher) {
    matcher = termMatcher(document.text);
    documentMatchers.set(document, matcher);
  }
  return matcher;
}

/** How many texts of the archive use each word, for the Memory tab. */
export function termItems(
  terms = listTerms(),
  documents: McpDocument[] = loadDocuments(),
): AiTermItem[] {
  const matchers = documents.map(matcherOf);
  return terms.map((term) => ({
    ...term,
    uses: matchers.filter((matches) => matches(term)).length,
  }));
}
