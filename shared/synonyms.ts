import { identityKey } from './identity-key';

/**
 * Synonyms: the other names the owner knows something by — «bg3» for
 * Baldur's Gate 3, «ЗГТ» for a transition. Tags, projects, events and pages
 * keep them. Every search finds the thing by them; no page ever shows them.
 */

/** More than this is a description, not a list of names. */
export const SYNONYM_LIMIT = 20;

/** The longest a single synonym may be: as long as a tag's title. */
export const SYNONYM_MAX_LENGTH = 100;

/** What separates synonyms typed or pasted as one line. */
export const SYNONYM_SEPARATOR = /[,;\n]/u;

/** A synonym as it is stored: trimmed, inner whitespace collapsed. */
export function cleanSynonym(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

/**
 * What a synonym is compared by: without case, compatibility forms or the
 * difference between «ё» and «е».
 */
export function synonymIdentity(value: string): string {
  return identityKey(value.trim());
}

/**
 * A list of synonyms as it is stored: cleaned, split where several were typed
 * as one line, each once, and never the title itself. Returns an error
 * message for anything that cannot be a list of words.
 */
export function normalizeSynonyms(
  value: unknown,
  title: string,
  messages: { tooLong: string; tooMany: string } = {
    tooLong: 'Synonym is too long',
    tooMany: 'Too many synonyms',
  },
): string[] | string {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return 'Invalid synonyms';
  const seen = new Set([synonymIdentity(title)]);
  const synonyms: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return 'Invalid synonyms';
    for (const part of item.split(SYNONYM_SEPARATOR)) {
      const synonym = cleanSynonym(part);
      if (!synonym) continue;
      if (synonym.length > SYNONYM_MAX_LENGTH) return messages.tooLong;
      const identity = synonymIdentity(synonym);
      if (seen.has(identity)) continue;
      seen.add(identity);
      synonyms.push(synonym);
    }
  }
  if (synonyms.length > SYNONYM_LIMIT) return messages.tooMany;
  return synonyms;
}
