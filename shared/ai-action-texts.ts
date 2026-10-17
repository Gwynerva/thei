import type { AiActionKind } from './ai-actions';

/**
 * The words a proposal carries that the owner may correct before applying
 * it: a description, a field's value, a note, a remembered fact, a word of
 * the dictionary and what it means, the facts a memory is said again in, a
 * text written, a relation's note, a new tag's title. The page draws each as
 * a field to correct; the server lays the corrected words back into the
 * proposal and checks it as it checks one the model made.
 *
 * Not a text edit's: its parts are decided on the review screen, and the
 * words taken are corrected in the editor. Not what is an identifier — an
 * address, a slug — nor what is no words at all.
 */

/**
 * How a text is corrected: one line, one item a line, a paragraph, or
 * editing Markdown.
 */
export type AiActionTextShape = 'line' | 'lines' | 'paragraph' | 'markdown';

export interface AiActionText {
  /** Where it stands in the proposal: `text`, `changes.summary`, `facts.0`… */
  key: string;
  value: string;
  shape: AiActionTextShape;
  /** A form's field, named as the page names its fields. */
  field?: string;
  /** What else it is, for its label. */
  role?:
    | 'description'
    | 'text'
    | 'fact'
    | 'word'
    | 'meaning'
    | 'tag'
    | 'note'
    | 'note-this'
    | 'note-other';
}

/** The kinds whose words the owner may correct before applying them. */
export const AI_EDITABLE_KINDS: ReadonlySet<AiActionKind> = new Set([
  'describe',
  'field',
  'update',
  'create',
  'note',
  'write',
  'remember',
  'term',
  'memory-compact',
  'relation',
  'tags',
]);

/** A form's fields whose values are the owner's words, and how each is. */
const FIELD_SHAPES: Record<string, AiActionTextShape> = {
  title: 'line',
  displayName: 'line',
  nickname: 'line',
  actionText: 'line',
  slogan: 'line',
  summary: 'paragraph',
  reminder: 'paragraph',
  description: 'paragraph',
  synonyms: 'lines',
};

type Payload = Record<string, unknown>;

/** A form's fields with words in them, as texts. */
function fieldTexts(prefix: string, fields: unknown): AiActionText[] {
  if (!fields || typeof fields !== 'object') return [];
  return Object.entries(fields as Payload).flatMap(
    ([field, value]): AiActionText[] => {
      const shape = FIELD_SHAPES[field];
      if (!shape) return [];
      if (shape === 'lines') {
        if (!Array.isArray(value)) return [];
        return [
          {
            key: `${prefix}${field}`,
            value: value.map(String).join('\n'),
            shape,
            field,
          },
        ];
      }
      return typeof value === 'string'
        ? [{ key: `${prefix}${field}`, value, shape, field }]
        : [];
    },
  );
}

/** The words of a proposal the owner may correct, in the order it shows them. */
export function actionTexts(kind: string, payload: unknown): AiActionText[] {
  if (!AI_EDITABLE_KINDS.has(kind as AiActionKind)) return [];
  const data = (payload ?? {}) as Payload;
  switch (kind) {
    case 'describe':
      return [
        {
          key: 'text',
          value: String(data.text ?? ''),
          shape: 'paragraph',
          role: 'description',
        },
      ];
    case 'field':
      return fieldTexts('', { [String(data.field)]: data.value }).map(
        (text) => ({ ...text, key: 'value' }),
      );
    case 'update':
      return fieldTexts('changes.', data.changes);
    case 'create':
      return fieldTexts('fields.', data.fields);
    case 'note':
    case 'write':
      return [
        {
          key: 'markdown',
          value: String(data.markdown ?? ''),
          shape: 'markdown',
          role: 'text',
        },
      ];
    case 'remember':
      return [
        {
          key: 'text',
          value: String(data.text ?? ''),
          shape: 'paragraph',
          role: 'fact',
        },
      ];
    case 'term':
      return [
        {
          key: 'word',
          value: String(data.word ?? ''),
          shape: 'line',
          role: 'word',
        },
        {
          key: 'note',
          value: String(data.note ?? ''),
          shape: 'paragraph',
          role: 'meaning',
        },
      ];
    case 'memory-compact':
      return (Array.isArray(data.facts) ? data.facts : []).map(
        (fact, index): AiActionText => ({
          key: `facts.${index}`,
          value: String(fact),
          shape: 'paragraph',
          role: 'fact',
        }),
      );
    case 'relation': {
      if (data.op === 'remove') return [];
      const note = data.note as
        | { type: 'shared'; text?: string }
        | { type: 'split'; currentText?: string; relatedText?: string }
        | undefined;
      if (note?.type === 'split')
        return [
          {
            key: 'note.this',
            value: note.currentText ?? '',
            shape: 'paragraph',
            role: 'note-this',
          },
          {
            key: 'note.other',
            value: note.relatedText ?? '',
            shape: 'paragraph',
            role: 'note-other',
          },
        ];
      return [
        {
          key: 'note',
          value: note?.text ?? '',
          shape: 'paragraph',
          role: 'note',
        },
      ];
    }
    case 'tags':
      return (Array.isArray(data.add) ? data.add : []).flatMap(
        (tag, index): AiActionText[] =>
          tag && typeof tag === 'object' && !(tag as Payload).ref
            ? [
                {
                  key: `add.${index}`,
                  value: String((tag as Payload).title ?? ''),
                  shape: 'line',
                  role: 'tag',
                },
              ]
            : [],
      );
    default:
      return [];
  }
}

/** A text's words as the proposal keeps them: a list, line by line. */
function valueOf(shape: AiActionTextShape, words: string): unknown {
  return shape === 'lines'
    ? words
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : words;
}

/**
 * The proposal with the owner's words laid in, by key; keys it does not
 * carry are left alone. The words are checked where the proposal is.
 */
export function withActionTexts(
  kind: string,
  payload: unknown,
  values: Readonly<Record<string, string>>,
): Payload {
  const data = structuredClone((payload ?? {}) as Payload);
  for (const text of actionTexts(kind, data)) {
    const words = values[text.key];
    if (typeof words !== 'string') continue;
    const value = valueOf(text.shape, words);
    const [head, tail] = text.key.split('.') as [string, string | undefined];
    if (kind === 'relation') {
      const note = (data.note ?? { type: 'shared' }) as Payload;
      if (head === 'note' && tail === 'this') note.currentText = words;
      else if (head === 'note' && tail === 'other') note.relatedText = words;
      else note.text = words;
      data.note = note;
    } else if (kind === 'tags' && tail !== undefined) {
      const add = data.add as Payload[];
      add[Number(tail)] = { ...add[Number(tail)], title: words };
    } else if (kind === 'memory-compact' && tail !== undefined) {
      (data.facts as unknown[])[Number(tail)] = words;
    } else if (tail !== undefined) {
      data[head] = { ...(data[head] as Payload), [tail]: value };
    } else data[head] = value;
  }
  return data;
}
