import type { AiActionItem } from '#layers/thei/shared/ai';
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
  return textChange(fieldValueWords(was), fieldValueWords(next));
}

/**
 * Old words and new as they are: word by word where most of the shorter
 * stays, whole where it is written anew, a value cleared said so.
 */
function textChange(old: string, now: string): AiValueChange {
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
 * A field's change in the shape a proposal gives it or a form keeps it,
 * said as `fieldSaid` says each side: a list item by item, else in words;
 * nothing, where neither side says anything.
 */
export function fieldChange(
  field: string,
  was: unknown,
  next: unknown,
  options: Parameters<typeof fieldSaid>[2] = {},
): AiValueChange {
  const before = fieldSaid(field, was, options);
  const after = fieldSaid(field, next, options);
  const list = (said: string | string[]) =>
    Array.isArray(said) ? said : said ? [said] : [];
  if (Array.isArray(before) || Array.isArray(after))
    return itemsChange(list(before), list(after));
  if (!before && !after) return { type: 'none' };
  return textChange(before, after);
}

/**
 * The fields an update changes, as its form keeps them (`key`) and by the
 * names a change gives them (`field`) — what its card's head says — each
 * with what it was and what it would be.
 */
export function updateFields(action: AiActionItem) {
  const base = (action.base ?? {}) as {
    fields?: string[];
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  // Without what it was made against, by the fields its change names.
  const changes = (action.payload as { changes?: object } | null)?.changes;
  return (base.fields ?? Object.keys(changes ?? {})).map((key) => ({
    key,
    field: action.fieldNames?.[key] ?? key,
    before: base.before?.[key],
    after: base.after?.[key],
  }));
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
