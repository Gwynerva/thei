import type { AiActionItem, AiEntityRef } from '#layers/thei/shared/ai';
import { diffContentText } from '#layers/thei/shared/content-diff';
import {
  RELATION_WORD_OF_TYPE,
  type RelationNote,
  type RelationType,
} from '#layers/thei/shared/relation';

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
 * word corrected — and, where its order means something, in its new order,
 * said so when the items it keeps change places; a value cleared, said so.
 */
export type AiValueChange =
  | { type: 'words'; pieces: AiChangePiece[] }
  | { type: 'whole'; before: string; after: string }
  | { type: 'items'; items: AiChangePiece[]; reordered?: boolean }
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
  // A relation's place in its list means nothing: it is shown by its kind.
  if (Array.isArray(before) || Array.isArray(after))
    return itemsChange(list(before), list(after), field !== 'relations');
  if (!before && !after) return { type: 'none' };
  return textChange(before, after);
}

/** A relation as a form keeps it. */
type RelationKept = {
  entityType?: string;
  entityId?: string;
  type?: RelationType;
  note?: RelationNote;
};

/** How a relation stands and what its note says, as one line of words. */
function relationStanding(relation: RelationKept): string {
  const note = relation.note;
  const notes =
    note?.type === 'split'
      ? [note.currentText, note.relatedText]
      : [note?.type === 'shared' ? note.text : undefined];
  return [
    relation.type
      ? phrase.value.ai_action_relations[RELATION_WORD_OF_TYPE[relation.type]]
      : '',
    notes
      .filter((text) => text?.trim())
      .map((text) => publicText(text))
      .join(' / '),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The relations a change keeps with the same entities but sets otherwise —
 * how they stand, or what their note says — each by the entity it leads
 * to, old → new, as any field's change is said.
 */
export function relationChanges(
  was: unknown,
  next: unknown,
  refs: Record<string, AiEntityRef> = {},
): { name: string; change: AiValueChange }[] {
  const kept = (value: unknown) =>
    (Array.isArray(value) ? value : []) as RelationKept[];
  const end = (relation: RelationKept) =>
    `${relation.entityType}:${relation.entityId}`;
  const before = new Map(
    kept(was).map((relation) => [end(relation), relation]),
  );
  return kept(next).flatMap((relation) => {
    const old = before.get(end(relation));
    if (!old) return [];
    const from = relationStanding(old);
    const to = relationStanding(relation);
    if (from === to) return [];
    return [
      {
        name: relationWords(old, refs) || relationWords(relation, refs),
        change: textChange(from, to),
      },
    ];
  });
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
 * comes. The forms of a word of the dictionary go so, unformatted. Where
 * the order means something (`ordered`) and the items it keeps change
 * places, it is said in its new order, what goes after it, and marked so.
 */
export function itemsChange(
  before: string[],
  after: string[],
  ordered = false,
): AiValueChange {
  const kept = new Set(after);
  const had = new Set(before);
  const stay = (list: string[], other: Set<string>) =>
    list.filter((text) => other.has(text)).join('\n');
  if (ordered && stay(before, kept) !== stay(after, had))
    return {
      type: 'items',
      reordered: true,
      items: [
        ...after.map((text): AiChangePiece => ({
          kind: had.has(text) ? 'same' : 'added',
          text,
        })),
        ...before
          .filter((text) => !kept.has(text))
          .map((text): AiChangePiece => ({ kind: 'removed', text })),
      ],
    };
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
