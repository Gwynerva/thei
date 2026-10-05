/**
 * The mark a caption or a heading ends with.
 *
 * A caption — under a picture, on a showcase tile, on a file, a link note, a
 * status — is usually a fragment, and a fragment takes no full stop (Chicago
 * 3.21, Wikipedia's MOS:CAPTION, Milchin). One sentence of any length is read
 * as one: telling a complete sentence from a fragment needs grammar, and the
 * result must not flip when a word is added. A caption of several sentences
 * ends with a mark, as each of its sentences does.
 *
 * A heading — a title, a heading block, a period's label — never ends with a
 * full stop, however many sentences it has; the ones inside stay.
 *
 * Both keep a question, an exclamation and an ellipsis exactly as typed, and
 * the full stop of an abbreviation ("1990 г.", "и т. д.", "Smith et al.").
 *
 * This is canonicalization on the way in, like collapsing whitespace: it runs
 * where a value is saved, never while it is typed, or a caption would lose its
 * full stop halfway through its second sentence.
 */
export type TerminalPunctuationKind = 'caption' | 'heading';

export function normalizeCaptionText(value: string): string {
  return normalizeTerminalPunctuation(value, 'caption');
}

export function normalizeHeadingText(value: string): string {
  return normalizeTerminalPunctuation(value, 'heading');
}

/** A caption as it is stored: trimmed and settled, or nothing at all. */
export function optionalCaption(value: string | undefined): string | undefined {
  return normalizeCaptionText(value?.trim() ?? '') || undefined;
}

/** A heading as it is stored: trimmed and settled, or nothing at all. */
export function optionalHeading(value: string | undefined): string | undefined {
  return normalizeHeadingText(value?.trim() ?? '') || undefined;
}

export function normalizeTerminalPunctuation(
  value: string,
  kind: TerminalPunctuationKind,
): string {
  const { cut, marks } = planEnding(value, kind);
  return value.slice(0, cut) + marks;
}

/**
 * The same over inline markup: the rule reads the visible text, and only the
 * characters of its ending are touched, wherever a tag puts them. A mark that
 * has to be added goes after every closing tag — the full stop ends the
 * caption, not the link or the emphasis it ends on.
 *
 * What is left may hold an emptied element, so the caller canonicalizes the
 * markup again when it changed.
 */
export function punctuateInlineHtml(
  html: string,
  kind: TerminalPunctuationKind,
): string {
  const { text, spans } = visibleText(html);
  const { cut, marks } = planEnding(text, kind);
  if (text.slice(0, cut) + marks === text) return html;

  const removed: [number, number][] = [];
  let next = 0;
  for (let index = cut; index < text.length; index++) {
    if (next < marks.length && text[index] === marks[next]) next++;
    else removed.push(spans[index]!);
  }

  let output = '';
  let cursor = 0;
  for (const [start, end] of removed) {
    output += html.slice(cursor, start);
    cursor = end;
  }
  return output + html.slice(cursor) + marks.slice(next);
}

// The ending

const TAIL = /[\s.?!…,;]+$/u;
const CLOSERS = /[)\]»"”’']+$/u;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const OPEN_ENDING = /[\p{L}\p{M}\p{N}%°]/u;

function planEnding(
  text: string,
  kind: TerminalPunctuationKind,
): { cut: number; marks: string } {
  const tail = TAIL.exec(text)?.[0] ?? '';
  const cut = text.length - tail.length;
  const head = text.slice(0, cut);
  // A lone mark, or nothing at all, is left to say what it says.
  if (!WORD_CHARACTER.test(head))
    return { cut: text.trimEnd().length, marks: '' };

  let marks = tail.replace(/[\s,;]/gu, '');
  if (marks === '..') marks = '.';

  if (marks === '.' && !endsWithAbbreviation(head, 'end')) {
    if (kind === 'heading' || countSentences(head) < 2) marks = '';
  } else if (
    kind === 'caption' &&
    marks === '' &&
    endsOpen(head) &&
    countSentences(head) > 1
  ) {
    marks = '.';
  }
  return { cut, marks };
}

/**
 * Whether the last sentence still waits for its mark: a quotation or a
 * bracket that closes on its own mark has one ("…«где?»"), and nothing is put
 * after a colon, a dash or an emoji, which end on purpose.
 */
function endsOpen(head: string): boolean {
  const last = head.replace(CLOSERS, '').at(-1);
  return last !== undefined && OPEN_ENDING.test(last);
}

// Sentences

/** A figure's number in front of a caption is a label, not a sentence. */
const LABEL_WORD =
  /^(?:рис(?:унок)?|илл(?:юстрация)?|табл(?:ица)?|схема|фото|fig(?:ure)?|table|plate|photo)\.?\s*/iu;
const LABEL_NUMBER = /^(?:\d+(?:\.\d+)*|[IVXLCDM]{1,7})\.\s+/u;

const SENTENCE_BREAK =
  /([.?!…]+)[)\]»"”’']*\s+(?:[«"„“‘([]|[—–]\s*)*(?=[\p{Lu}\p{Lt}\p{Nd}])/gu;

function countSentences(head: string): number {
  const word = LABEL_WORD.exec(head)?.[0] ?? '';
  const label = LABEL_NUMBER.exec(head.slice(word.length))?.[0];
  const text = label ? head.slice(word.length + label.length) : head;

  let sentences = 1;
  for (const match of text.matchAll(SENTENCE_BREAK)) {
    if (
      match[1] === '.' &&
      endsWithAbbreviation(text.slice(0, match.index), 'inner')
    )
      continue;
    sentences++;
  }
  return sentences;
}

// Abbreviations

/**
 * The last word before a full stop, letters only, with the full stops inside
 * it ("т.д", "e.g"). It has to start a word: "3D." is not an initial.
 */
const LAST_WORD = /(?:^|[\s(«"„“‘[—–\-/])((?:[\p{L}\p{M}]+\.)*[\p{L}\p{M}]+)$/u;

/** Words that are cut short with a full stop, in Russian and in English. */
const ABBREVIATIONS = new Set([
  // Russian
  'гг',
  'вв',
  'др',
  'пр',
  'см',
  'ср',
  'ок',
  'им',
  'ул',
  'обл',
  'оз',
  'стр',
  'рис',
  'илл',
  'табл',
  'гл',
  'ред',
  'изд',
  'тыс',
  'млн',
  'млрд',
  'руб',
  'коп',
  'проф',
  'акад',
  'пер',
  'наб',
  'пл',
  'св',
  'ст',
  'напр',
  'кв',
  'корп',
  'пос',
  'дер',
  'нар',
  'засл',
  'яз',
  'соч',
  'мин',
  'сек',
  'янв',
  'фев',
  'февр',
  'мар',
  'апр',
  'июн',
  'июл',
  'авг',
  'сен',
  'сент',
  'окт',
  'ноя',
  'нояб',
  'дек',
  // English
  'etc',
  'inc',
  'ltd',
  'co',
  'corp',
  'jr',
  'sr',
  'st',
  'vs',
  'approx',
  'dept',
  'est',
  'fig',
  'figs',
  'no',
  'nos',
  'vol',
  'vols',
  'ed',
  'eds',
  'pp',
  'cf',
  'al',
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'gen',
  'gov',
  'lt',
  'col',
  'capt',
  'sgt',
  'rev',
  'mt',
  'ft',
  'ave',
  'blvd',
  'rd',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
]);

/**
 * Abbreviations that, closing a whole caption, are far more often the plain
 * word: "Say no.", "Спасибо им.", "Всё ок.".
 */
const ORDINARY_AT_END = new Set(['no', 'им', 'ок']);

function endsWithAbbreviation(
  before: string,
  position: 'inner' | 'end',
): boolean {
  const word = LAST_WORD.exec(before)?.[1];
  if (!word) return false;
  if (word.includes('.')) return true;
  // An initial, or a one-letter cut such as "г." — but "я" is a whole word.
  if (Array.from(word).length === 1) return word.toLowerCase() !== 'я';
  const lower = word.toLowerCase();
  if (position === 'end' && ORDINARY_AT_END.has(lower)) return false;
  return ABBREVIATIONS.has(lower);
}

// Markup

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * The text a reader sees, each character mapped back to the stretch of markup
 * it came from: an entity is one character, a `<br>` one space, and any other
 * tag nothing.
 */
function visibleText(html: string): {
  text: string;
  spans: [number, number][];
} {
  let text = '';
  const spans: [number, number][] = [];
  let index = 0;
  while (index < html.length) {
    const character = html[index]!;
    if (character === '<') {
      const end = html.indexOf('>', index);
      if (end !== -1) {
        if (/^<br\s*\/?>$/i.test(html.slice(index, end + 1))) {
          text += '\n';
          spans.push([index, end + 1]);
        }
        index = end + 1;
        continue;
      }
    }
    if (character === '&') {
      const entity = /^&(#\d+|#x[0-9a-f]+|[a-z]+);/i.exec(html.slice(index));
      if (entity) {
        text += decodeEntity(entity[1]!);
        spans.push([index, index + entity[0].length]);
        index += entity[0].length;
        continue;
      }
    }
    text += character;
    spans.push([index, index + 1]);
    index++;
  }
  return { text, spans };
}

/** One character for one entity, so the map stays one to one. */
function decodeEntity(name: string): string {
  if (name.startsWith('#')) {
    const code =
      name[1] === 'x' || name[1] === 'X'
        ? Number.parseInt(name.slice(2), 16)
        : Number.parseInt(name.slice(1), 10);
    const decoded =
      code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    return decoded.length === 1 ? decoded : '￼';
  }
  return ENTITIES[name.toLowerCase()] ?? '￼';
}
