import { diffContentText } from '#layers/thei/shared/content-diff';

/** One piece of a change said word by word: kept, gone or come. */
interface AiChangePiece {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

/**
 * A value and the one it replaces, as a card says it: word by word where
 * most of the shorter of the two stays, so an addition to a title shows
 * as an addition rather than the whole title struck; whole, old → new,
 * where it is written anew; a list item by item, what stays plain beside
 * what goes and what comes, so a synonym taken away is never read as a
 * word corrected; a value cleared, said so.
 */
export type AiValueChange =
  | { type: 'words'; pieces: AiChangePiece[] }
  | { type: 'whole'; before: string; after: string }
  | { type: 'items'; items: AiChangePiece[] }
  | { type: 'none' };

/** The words of a list's items: synonyms, statuses. */
function listWords(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const words = value.map((item) =>
    typeof item === 'string'
      ? item
      : item && typeof item === 'object' && 'text' in item
        ? String((item as { text: unknown }).text)
        : null,
  );
  return words.every((word) => word !== null)
    ? (words as string[]).map((word) => publicText(word))
    : null;
}

/** A value a line can say: words, a number, a yes or no. */
const sayable = (value: unknown) =>
  value === null ||
  value === undefined ||
  ['string', 'number', 'boolean'].includes(typeof value);

export function valueChange(was: unknown, next: unknown): AiValueChange {
  const before = listWords(was ?? (Array.isArray(next) ? [] : null));
  const after = listWords(next ?? (Array.isArray(was) ? [] : null));
  if (before && after) return itemsChange(before, after);
  if (!sayable(was) || !sayable(next)) return { type: 'none' };
  const old = fieldValueWords(was);
  const now = fieldValueWords(next);
  const parts = old && now ? diffContentText(old, now) : [];
  const kept = parts
    .filter((part) => part.kind === 'same')
    .reduce((sum, part) => sum + part.text.trim().length, 0);
  if (old && now && kept >= Math.min(old.length, now.length) / 2)
    return {
      type: 'words',
      pieces: parts.map((part) => ({ kind: part.kind, text: part.text })),
    };
  return { type: 'whole', before: old, after: now };
}

/**
 * A list item by item, its words as given: what stays, what goes, what
 * comes. The forms of a word of the dictionary go so, unformatted.
 */
export function itemsChange(before: string[], after: string[]): AiValueChange {
  const kept = new Set(after);
  const had = new Set(before);
  return {
    type: 'items',
    items: [
      ...before.map((text): AiChangePiece => ({
        kind: kept.has(text) ? 'same' : 'removed',
        text,
      })),
      ...after
        .filter((text) => !had.has(text))
        .map((text): AiChangePiece => ({ kind: 'added', text })),
    ],
  };
}

/** Old words and new, word by word whatever their share: a description. */
export function wordsChange(was: string, next: string): AiValueChange {
  if (!was) return { type: 'whole', before: '', after: next };
  return {
    type: 'words',
    pieces: diffContentText(was, next).map((part) => ({
      kind: part.kind,
      text: part.text,
    })),
  };
}
