import { letterSimilarity } from '../text-similarity';
import type { ContentOutputBlock, ContentOutputData } from '../content';
import { decodeHtmlEntities, escapeHtmlText } from './html';

/**
 * Small, exact changes to a stored text: find these words, put those in their
 * place. It is how a typo is fixed or a mention becomes a link without the
 * rest of a long text being handed back and forth.
 *
 * `find` is the text as a reader sees it, without Markdown marks, and must
 * stand inside one run of text — never across a link's edge or a bold word's.
 * This part knows nothing of Markdown: what goes in place of the words comes
 * ready as stored markup (`patch.ts` makes it from Markdown on the server),
 * so a page can apply a change it was handed without a Markdown parser.
 */
export interface TextEdit {
  find: string;
  replace: string;
  /** Every occurrence, instead of exactly one. */
  all?: boolean;
}

/** An edit with its replacement already as stored markup. */
export interface PreparedTextEdit extends TextEdit {
  /** For a field of inline markup. */
  replaceHtml: string;
  /** For a field of plain text: the replacement's words alone. */
  replacePlain: string;
  /** Whether the replacement makes something a link. */
  links: boolean;
}

export interface TextEditOutcome {
  edit: TextEdit;
  /** How many places it changed; 0 when it was refused. */
  count: number;
  problem?: string;
}

/** Typography a reader never types and the site sets itself. */
function typographyKey(value: string): string {
  return value
    .replace(/[«»„“”"]/g, '"')
    .replace(/[‘’‚']/g, "'")
    .replace(/[—–‒−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\s  ]+/g, ' ')
    .trim();
}

/** The words of editing Markdown, its marks and link addresses dropped. */
export function stripMarks(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '');
}

/**
 * Whether an edit only makes its words a link to an entity of the site:
 * `Parapet` → `[Parapet](thei:project/<id>)`, every word as it was.
 */
export function makesLinkOnly(edit: Pick<TextEdit, 'find' | 'replace'>) {
  const words = edit.replace.replace(/\[([^\]]*)\]\(thei:[^)\s]+\)/g, '$1');
  return words !== edit.replace && words === edit.find;
}

/** Whether an edit changes nothing but what the site typesets on its own. */
export function editChangesOnlyTypography(edit: TextEdit): boolean {
  // Words made a link or bold are not typography, whatever their letters.
  if (stripMarks(edit.replace) !== edit.replace) return false;
  return (
    edit.find !== edit.replace &&
    typographyKey(edit.find) === typographyKey(edit.replace)
  );
}

/**
 * How many words an edit touches: the words that differ once both sides are
 * read as words. A proofreading fix touches one or two; a rewrite, many.
 */
export function editedWordCount(edit: TextEdit): number {
  const { before, after } = changedWords(edit);
  return Math.max(before.length, after.length);
}

/**
 * How alike the words before and after an edit are, from 0 to 1, letter by
 * letter. A typo fixed, an ending changed, a comma added leave them alike;
 * a word swapped for a synonym does not — and that is a rewrite, however few
 * words it touches.
 */
function editSimilarity(edit: TextEdit): number {
  // Only what changed is compared: words kept on either side would make
  // any swap look alike.
  const changed = changedWords(edit);
  const before = changed.before.join(' ');
  const after = changed.after.join(' ');
  if (!before || !after) {
    // A word added or dropped: a missing preposition is a fix, a phrase is not.
    const word = before || after;
    return !word.includes(' ') && word.length <= 3 ? 1 : 0;
  }
  return letterSimilarity(before.toLowerCase(), after.toLowerCase());
}

/** The words an edit changes, with those both sides share trimmed off. */
function changedWords(edit: TextEdit) {
  const before = edit.find.split(/\s+/).filter(Boolean);
  const after = stripMarks(edit.replace).split(/\s+/).filter(Boolean);
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  return {
    before: before.slice(start, before.length - end),
    after: after.slice(start, after.length - end),
  };
}

/** A fix, not a rewrite: few words touched, and those still recognisable. */
export function editIsLocalFix(edit: TextEdit): boolean {
  return editedWordCount(edit) <= 3 && editSimilarity(edit) >= 0.5;
}

const TAG = /<[^>]+>/g;

/** Text runs of inline markup, with whether each sits inside a link. */
function runsOf(html: string) {
  const runs: { start: number; end: number; inLink: boolean }[] = [];
  let depth = 0;
  let cursor = 0;
  for (const match of html.matchAll(TAG)) {
    const index = match.index ?? 0;
    if (index > cursor)
      runs.push({ start: cursor, end: index, inLink: depth > 0 });
    if (/^<a\b/i.test(match[0])) depth++;
    else if (/^<\/a>/i.test(match[0])) depth = Math.max(0, depth - 1);
    cursor = index + match[0].length;
  }
  if (cursor < html.length)
    runs.push({ start: cursor, end: html.length, inLink: depth > 0 });
  return runs;
}

export interface ContentTextField {
  get: () => string;
  set: (value: string) => void;
  /** Inline markup; otherwise plain text. */
  html: boolean;
  /** Plain text stored escaped, as a heading's is. */
  escaped?: boolean;
}

/** The fields of a block that hold words, each read and written in place. */
export function contentTextFields(
  block: ContentOutputBlock,
): ContentTextField[] {
  const data = block.data as Record<string, any>;
  const itemField = (
    item: Record<string, any>,
    key: string,
    html: boolean,
    escaped = false,
  ): ContentTextField => ({
    get: () => (typeof item[key] === 'string' ? item[key] : ''),
    set: (value) => {
      item[key] = value;
    },
    html,
    escaped,
  });
  const field = (key: string, html: boolean, escaped = false) =>
    itemField(data, key, html, escaped);
  switch (block.type) {
    case 'paragraph':
      return [field('text', true)];
    case 'header':
      return [field('text', false, true)];
    case 'quote':
      return [field('text', true), field('caption', true)];
    case 'list': {
      const fields: ContentTextField[] = [];
      const walk = (items: Record<string, any>[]) => {
        for (const item of items ?? []) {
          fields.push({
            get: () => (typeof item.content === 'string' ? item.content : ''),
            set: (value) => {
              item.content = value;
            },
            html: true,
          });
          walk(item.items);
        }
      };
      walk(data.items);
      return fields;
    }
    case 'contentMedia':
      return [field('caption', true)];
    case 'contentGallery':
      return [
        field('title', false),
        ...(data.items ?? []).map((item: Record<string, any>) =>
          itemField(item, 'caption', true),
        ),
      ];
    case 'contentAudio':
    case 'contentAttachment':
      return [field('title', false), field('caption', true)];
    case 'contentFileGroup':
      return [
        field('title', false),
        ...(data.items ?? []).flatMap((item: Record<string, any>) => [
          itemField(item, 'title', false),
          itemField(item, 'caption', true),
        ]),
      ];
    case 'externalLink':
    case 'entityLink':
      return [field('note', false)];
    default:
      return [];
  }
}

function storedOffset(
  raw: string,
  decodedOffset: number,
  field: ContentTextField,
) {
  if (!field.html && !field.escaped) return decodedOffset;
  let decoded = 0;
  let index = 0;
  while (index < raw.length && decoded < decodedOffset) {
    const entity = /^&(#x[0-9a-f]+|#\d+|[a-z]+);/i.exec(raw.slice(index));
    index += entity ? entity[0].length : 1;
    decoded++;
  }
  return index;
}

/** Where `find` stands in a field, as offsets into its stored form. */
function matchesIn(field: ContentTextField, find: string) {
  const value = field.get();
  const found: { start: number; end: number; inLink: boolean }[] = [];
  const runs = field.html
    ? runsOf(value)
    : [{ start: 0, end: value.length, inLink: false }];
  for (const run of runs) {
    const raw = value.slice(run.start, run.end);
    const text = field.html || field.escaped ? decodeHtmlEntities(raw) : raw;
    let from = text.indexOf(find);
    while (from !== -1) {
      // Offsets in the decoded text map back to the stored one through the
      // entities before them; a match never starts or ends inside one.
      const start = run.start + storedOffset(raw, from, field);
      const end = run.start + storedOffset(raw, from + find.length, field);
      found.push({ start, end, inLink: run.inLink });
      from = text.indexOf(find, from + Math.max(1, find.length));
    }
  }
  return found;
}

/** A field's markup as a reader sees it: words, tags and entities resolved. */
function fieldWords(value: string, field: ContentTextField) {
  const text = field.html ? value.replace(TAG, '') : value;
  return field.html || field.escaped ? decodeHtmlEntities(text) : text;
}

/** Where a text edit's words stand, for a page to show the edit in place. */
export interface TextEditPlace {
  /** The block, by its place among the text's blocks. */
  block: number;
  /** A run of inline markup; otherwise plain words, escaped or not. */
  html: boolean;
  escaped: boolean;
  /** The words of its field before and after it, as a reader sees them. */
  before: string;
  after: string;
}

/**
 * Lays edits over a copy of a text for a page to show them where they fall:
 * the one place each edit's words stand is replaced by what `put` returns,
 * given the stored markup there now. An edit whose words do not stand
 * exactly once is left out. The text is not changed otherwise, and nothing is
 * checked of what goes in: this is for showing, never for storing.
 */
export function placeTextEdits(
  data: ContentOutputData,
  edits: readonly { id: string; find: string }[],
  put: (id: string, stored: string, place: TextEditPlace) => string,
): { data: ContentOutputData; places: Map<string, TextEditPlace> } {
  const copy = structuredClone(data);
  const places = new Map<string, TextEditPlace>();
  for (const edit of edits) {
    if (!edit.find) continue;
    const matches = copy.blocks.flatMap((block, index) =>
      contentTextFields(block).flatMap((field) =>
        matchesIn(field, edit.find).map((match) => ({
          block: index,
          field,
          ...match,
        })),
      ),
    );
    if (matches.length !== 1) continue;
    const match = matches[0]!;
    const value = match.field.get();
    const place: TextEditPlace = {
      block: match.block,
      html: match.field.html,
      escaped: Boolean(match.field.escaped),
      before: fieldWords(value.slice(0, match.start), match.field),
      after: fieldWords(value.slice(match.end), match.field),
    };
    match.field.set(
      value.slice(0, match.start) +
        put(edit.id, value.slice(match.start, match.end), place) +
        value.slice(match.end),
    );
    places.set(edit.id, place);
  }
  return { data: copy, places };
}

/**
 * The edits whose one place overlaps the place of an edit before them, by
 * their index: two edits of the same words cannot both be made.
 */
export function overlappingEdits(
  data: ContentOutputData,
  edits: readonly Pick<TextEdit, 'find'>[],
): Set<number> {
  const placed: { block: number; field: number; start: number; end: number }[] =
    [];
  const overlapping = new Set<number>();
  edits.forEach((edit, index) => {
    if (!edit.find) return;
    const matches = data.blocks.flatMap((block, blockIndex) =>
      contentTextFields(block).flatMap((field, fieldIndex) =>
        matchesIn(field, edit.find).map((match) => ({
          block: blockIndex,
          field: fieldIndex,
          start: match.start,
          end: match.end,
        })),
      ),
    );
    if (matches.length !== 1) return;
    const at = matches[0]!;
    if (
      placed.some(
        (other) =>
          other.block === at.block &&
          other.field === at.field &&
          at.start < other.end &&
          other.start < at.end,
      )
    )
      overlapping.add(index);
    else placed.push(at);
  });
  return overlapping;
}

/** How many times `find` stands in a text as one run of words. */
export function countTextMatches(
  data: ContentOutputData | null | undefined,
  find: string,
): number {
  if (!data || !find) return 0;
  return data.blocks
    .flatMap(contentTextFields)
    .reduce((total, field) => total + matchesIn(field, find).length, 0);
}

function occurrences(value: string, part: string): number {
  if (!part) return 0;
  let count = 0;
  for (
    let at = value.indexOf(part);
    at !== -1;
    at = value.indexOf(part, at + part.length)
  )
    count++;
  return count;
}

/**
 * Whether a correction's words still stand unfixed in a text. A fix that
 * keeps the words and adds to them — a comma, a letter — leaves them inside
 * the fixed words, where they are not the mistake any more.
 */
export function correctionPending(
  data: ContentOutputData | null | undefined,
  edit: Pick<TextEdit, 'find' | 'replace'>,
): boolean {
  // Words made a link stay the same words: they wait while one of them
  // stands outside a link.
  if (makesLinkOnly(edit))
    return Boolean(
      data?.blocks
        .flatMap(contentTextFields)
        .some((field) =>
          matchesIn(field, edit.find).some((match) => !match.inLink),
        ),
    );
  const found = countTextMatches(data, edit.find);
  if (!found) return false;
  const inside = occurrences(edit.replace, edit.find);
  return !inside || found > countTextMatches(data, edit.replace) * inside;
}

/**
 * Applies edits to a copy of a text, each to its own matches as the text
 * stands after the edits before it. An edit that matches nowhere, matches
 * more than once without `all`, would put a link inside a link, or changes
 * only typography is refused and leaves the text as it was.
 */
export function applyPreparedTextEdits(
  data: ContentOutputData,
  edits: readonly PreparedTextEdit[],
): { data: ContentOutputData; outcomes: TextEditOutcome[] } {
  const copy = structuredClone(data);
  const outcomes: TextEditOutcome[] = [];
  for (const edit of edits) {
    if (!edit.find) {
      outcomes.push({ edit, count: 0, problem: 'Nothing to find.' });
      continue;
    }
    if (editChangesOnlyTypography(edit)) {
      outcomes.push({
        edit,
        count: 0,
        problem:
          'It changes only typography — quotes, dashes, spaces — which the site sets on its own.',
      });
      continue;
    }
    const matches = copy.blocks
      .flatMap(contentTextFields)
      .flatMap((field) =>
        matchesIn(field, edit.find).map((match) => ({ field, ...match })),
      );
    if (!matches.length) {
      outcomes.push({
        edit,
        count: 0,
        problem: `"${edit.find}" is not in the text as one run of words.`,
      });
      continue;
    }
    if (matches.length > 1 && !edit.all) {
      outcomes.push({
        edit,
        count: 0,
        problem: `"${edit.find}" stands ${matches.length} times; give more of the words around it, or set all.`,
      });
      continue;
    }
    if (edit.links && matches.some((match) => match.inLink)) {
      outcomes.push({
        edit,
        count: 0,
        problem: 'Those words are already a link; a link cannot hold another.',
      });
      continue;
    }
    // Last first, so earlier offsets stay true.
    for (const match of [...matches].reverse()) {
      const value = match.field.get();
      const inserted = match.field.html
        ? edit.replaceHtml
        : match.field.escaped
          ? escapeHtmlText(edit.replacePlain)
          : edit.replacePlain;
      match.field.set(
        value.slice(0, match.start) + inserted + value.slice(match.end),
      );
    }
    outcomes.push({ edit, count: matches.length });
  }
  return { data: copy, outcomes };
}
