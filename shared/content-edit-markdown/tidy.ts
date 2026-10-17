import type { ContentOutputBlock } from '../content';
import {
  TIDY_COMMENT_KINDS,
  TIDY_COMMENT_MAX,
  TIDY_COMMENTS_MAX,
  TIDY_HEADING_MAX,
  type TidyComment,
  type TidyCommentKind,
  type TidyItem,
  type TidyRemoval,
} from '../ai-revise';
import { canonicalMarkup, editBlockKey, newEditBlockId } from './block-key';
import { decodeHtmlEntities, escapeHtmlText } from './html';

/**
 * Tidying a text without rewriting it.
 *
 * A model hands back the whole text in a better order. What it may do is
 * narrow and checked here, not trusted: keep the owner's blocks, move them,
 * split a paragraph into pieces of its own words, drop a piece that repeats
 * another — saying why — and add a heading or a delimiter. Anything else in
 * what it wrote is a rewrite, and the plan is refused.
 *
 * A plan names the blocks it moves by their place in the text the model read,
 * with a short hash of each. Many stored blocks have no id, so the place is
 * the only name they have; the hashes let a later text be matched against it
 * — a proofread fix in between changes a block, not its place — and say when
 * it has moved on too far for the plan to mean anything.
 */

type Block = Pick<ContentOutputBlock, 'type' | 'data' | 'tunes'> & {
  id?: string;
};

/** A short, stable name for what a block says. */
export function tidyBlockHash(block: Block): string {
  const value = editBlockKey(block);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Inline markup as words a reader sees. */
export function tidyHtmlText(html: string): string {
  return decodeHtmlEntities(
    html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function listText(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const entry = item as { content?: unknown; items?: unknown };
    return [
      tidyHtmlText(String(entry?.content ?? '')),
      ...listText(entry?.items),
    ];
  });
}

/** What a block says in words, to find a quote in it. */
export function tidyBlockText(block: Pick<Block, 'type' | 'data'>): string {
  const data = block.data as Record<string, unknown>;
  const text = (...values: unknown[]) =>
    values
      .filter((value) => typeof value === 'string' && value)
      .map((value) => tidyHtmlText(value as string))
      .join(' ');
  switch (block.type) {
    case 'paragraph':
    case 'header':
      return text(data.text);
    case 'quote':
      return text(data.text, data.caption);
    case 'list':
      return listText(data.items).join(' ');
    case 'contentMedia':
    case 'contentAudio':
    case 'contentAttachment':
      return text(data.title, data.caption);
    case 'contentGallery':
    case 'contentFileGroup':
      return text(
        data.title,
        ...(Array.isArray(data.items) ? data.items : []).flatMap((item) => [
          (item as { title?: unknown }).title,
          (item as { caption?: unknown }).caption,
        ]),
      );
    case 'externalLink':
      return text(data.url, data.note);
    case 'entityLink':
      return text(`thei:${data.entityType}/${data.entityId}`, data.note);
    case 'integration':
      return text(data.videoId);
    default:
      return '';
  }
}

/** Words as a quote is compared: case, quotes, dashes and spaces aside. */
function looseText(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[«»„“”"‘’'`]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\s  ]+/g, ' ')
    .trim();
}

/** A paragraph's markup as pieces of it are compared. */
function flatMarkup(html: string): string {
  return canonicalMarkup(html)
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

const VOID_TAGS = new Set(['br', 'wbr', 'img']);

/** Whether a run of inline markup opens and closes its own tags. */
function balancedMarkup(html: string): boolean {
  const open: string[] = [];
  for (const match of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi)) {
    const tag = match[2]!.toLowerCase();
    if (match[3] || VOID_TAGS.has(tag)) continue;
    if (match[1]) {
      if (open.pop() !== tag) return false;
    } else open.push(tag);
  }
  return !open.length;
}

const HAS_WORDS = /[\p{L}\p{N}]/u;

function short(value: string, length = 60): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** Blocks a tidy may move but never drop: the owner's files and private parts. */
const ALWAYS_KEPT = new Set([
  'contentMedia',
  'contentGallery',
  'contentAudio',
  'contentAttachment',
  'contentFileGroup',
  'privateSectionBoundary',
]);

export interface TidyRemovalInput {
  /** A few words of what goes. */
  quote: string;
  reason: string;
  /** A few words of where the same already stands. */
  duplicateOf?: string;
}

export interface TidyCommentInput {
  quote?: string;
  kind: TidyCommentKind;
  comment: string;
}

export interface TidyPlan {
  keys: string[];
  items: TidyItem[];
  comments: TidyComment[];
  /** Why the tidied text cannot be taken, each a sentence for the model. */
  problems: string[];
  /** What was left out of a plan that is otherwise taken. */
  dropped: string[];
}

interface PartMatch {
  slot: number;
  offset: number;
  length: number;
}

function boundaryBefore(source: string, offset: number) {
  return (
    offset === 0 ||
    source[offset - 1] === ' ' ||
    source.slice(0, offset).endsWith('<br>')
  );
}

function boundaryAfter(source: string, end: number) {
  return (
    end === source.length ||
    source[end] === ' ' ||
    source.startsWith('<br>', end)
  );
}

/** The private section each block sits in; a bound is in none. */
function privateScopes(blocks: readonly Block[]): (string | undefined)[] {
  let current: string | undefined;
  return blocks.map((block) => {
    if (block.type !== 'privateSectionBoundary') return current;
    const data = block.data as { sectionId?: string; edge?: string };
    current = data.edge === 'start' ? data.sectionId : undefined;
    return undefined;
  });
}

/**
 * Works out what a tidied text does to the text it was made from, or why it
 * cannot be taken. `stored` is the text as the model read it, `written` the
 * text it handed back, both as stored blocks.
 */
export function planTidy(
  stored: readonly Block[],
  written: readonly Block[],
  removals: readonly TidyRemovalInput[],
  commentInputs: readonly TidyCommentInput[],
): TidyPlan {
  const problems: string[] = [];
  const dropped: string[] = [];
  const keys = stored.map(tidyBlockHash);
  const storedKeys = stored.map(editBlockKey);
  const matched = new Array<boolean>(stored.length).fill(false);
  const slots = new Array<TidyItem | undefined>(written.length);

  // The owner's blocks as they were, wherever they went.
  written.forEach((block, slot) => {
    const key = editBlockKey(block);
    const from = storedKeys.findIndex(
      (storedKey, index) => !matched[index] && storedKey === key,
    );
    if (from < 0) return;
    matched[from] = true;
    slots[slot] = { type: 'block', from };
  });

  // What is new: a heading, a delimiter, or a piece of a paragraph.
  const parts = new Map<number, PartMatch[]>();
  const sources = stored.map((block) =>
    block.type === 'paragraph' ? flatMarkup(String(block.data.text ?? '')) : '',
  );
  let headings = 0;
  written.forEach((block, slot) => {
    if (slots[slot]) return;
    if (block.type === 'header') {
      const text = tidyHtmlText(String(block.data.text ?? ''));
      if (!text) return;
      if (text.length > TIDY_HEADING_MAX)
        problems.push(
          `The heading "${short(text)}" is too long: a heading names a topic in a few words.`,
        );
      headings++;
      slots[slot] = {
        type: 'heading',
        text: text.slice(0, TIDY_HEADING_MAX),
        level: block.data.level === 3 ? 3 : 2,
      };
      return;
    }
    if (block.type === 'delimiter') {
      slots[slot] = { type: 'delimiter' };
      return;
    }
    const words = tidyBlockText(block);
    if (block.type === 'paragraph') {
      const html = flatMarkup(String(block.data.text ?? ''));
      if (!html) return;
      for (let from = 0; from < stored.length; from++) {
        const source = sources[from]!;
        if (
          matched[from] ||
          !source ||
          Boolean(stored[from]!.tunes?.spoiler) !==
            Boolean(block.tunes?.spoiler)
        )
          continue;
        const taken = parts.get(from) ?? [];
        let offset = source.indexOf(html);
        while (offset >= 0) {
          const end = offset + html.length;
          const free = taken.every(
            (part) => end <= part.offset || offset >= part.offset + part.length,
          );
          if (
            free &&
            boundaryBefore(source, offset) &&
            boundaryAfter(source, end)
          ) {
            parts.set(from, [...taken, { slot, offset, length: html.length }]);
            slots[slot] = {
              type: 'part',
              from,
              offset,
              html: source.slice(offset, end),
            };
            return;
          }
          offset = source.indexOf(html, offset + 1);
        }
      }
    }
    problems.push(
      `"${short(words) || block.type}" is not in the text as the owner wrote it. Tidying moves the owner's blocks, splits a paragraph between its words and adds headings; it never rewrites. Fix words with proofread.`,
    );
  });
  if (headings > 30)
    problems.push(
      'Too many headings: a heading opens a topic, not a paragraph.',
    );

  // What disappears, each piece with its reason.
  const declared = removals.map((removal) => ({
    ...removal,
    loose: looseText(removal.quote ?? ''),
    used: false,
  }));
  const declaredFor = (words: string) => {
    const loose = looseText(words);
    const removal = declared.find(
      (item) => item.loose && loose.includes(item.loose),
    );
    if (removal) removal.used = true;
    return removal;
  };
  const removed: {
    from: number;
    offset?: number;
    html?: string;
    removal: TidyRemovalInput;
  }[] = [];

  stored.forEach((block, from) => {
    if (matched[from]) return;
    const pieces = (parts.get(from) ?? []).sort((a, b) => a.offset - b.offset);
    const source = sources[from]!;
    if (
      pieces.length === 1 &&
      pieces[0]!.offset === 0 &&
      pieces[0]!.length === source.length
    ) {
      // Written again as it was, in markup that differs by nothing a reader sees.
      slots[pieces[0]!.slot] = { type: 'block', from };
      return;
    }
    if (pieces.length) {
      const gaps: [number, number][] = [];
      let cursor = 0;
      for (const piece of pieces) {
        gaps.push([cursor, piece.offset]);
        cursor = piece.offset + piece.length;
      }
      gaps.push([cursor, source.length]);
      for (const [start, end] of gaps) {
        const raw = source.slice(start, end);
        const html = raw.replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, '');
        const words = tidyHtmlText(html);
        if (!HAS_WORDS.test(words)) continue;
        if (!balancedMarkup(html)) {
          problems.push(
            `A split of "${short(tidyHtmlText(source))}" cuts through bold, italic or a link; split it between whole pieces.`,
          );
          continue;
        }
        const removal = declaredFor(words);
        if (!removal) {
          problems.push(
            `"${short(words)}" would disappear from its paragraph. Put it back, or list it in removals with the reason it goes.`,
          );
          continue;
        }
        removed.push({
          from,
          offset: start + raw.indexOf(html),
          html,
          removal,
        });
      }
      return;
    }
    if (ALWAYS_KEPT.has(block.type)) {
      problems.push(
        block.type === 'privateSectionBoundary'
          ? 'A private part of the text is gone or broken: keep every :::private section with what is inside it.'
          : `A ${block.type} block is gone: tidying keeps every picture and file, wherever it puts them.`,
      );
      return;
    }
    const words = tidyBlockText(block);
    if (!HAS_WORDS.test(words)) {
      removed.push({ from, removal: { quote: '', reason: '' } });
      return;
    }
    const removal = declaredFor(words);
    if (!removal) {
      problems.push(
        `"${short(words)}" would disappear. Put it back, or list it in removals with the reason it goes.`,
      );
      return;
    }
    removed.push({ from, removal });
  });

  for (const removal of declared)
    if (!removal.used)
      dropped.push(
        `The removal "${short(removal.quote)}" matches nothing that disappears.`,
      );

  // Nothing may cross into or out of a private part.
  const scopes = privateScopes(stored);
  let scope: string | undefined;
  let crossed = false;
  for (const item of slots) {
    if (!item || (item.type !== 'block' && item.type !== 'part')) continue;
    const block = stored[item.from]!;
    if (block.type === 'privateSectionBoundary') {
      const data = block.data as { sectionId?: string; edge?: string };
      if (data.edge === 'start') {
        if (scope !== undefined) crossed = true;
        scope = data.sectionId;
      } else {
        if (scope !== data.sectionId) crossed = true;
        scope = undefined;
      }
      continue;
    }
    if (scopes[item.from] !== scope) crossed = true;
  }
  if (crossed || scope !== undefined)
    problems.push(
      'A block would cross the edge of a private part, which would show a private word to every reader or hide a public one. Keep each block on its side of every :::private edge.',
    );

  if (problems.length)
    return { keys, items: [], comments: [], problems, dropped };

  // The tidied text, with what goes shown where it would return.
  const items = slots.filter((item): item is TidyItem => Boolean(item));
  const lastOf = (from: number) => {
    for (let index = items.length - 1; index >= 0; index--) {
      const item = items[index]!;
      if ((item.type === 'block' || item.type === 'part') && item.from === from)
        return index;
    }
    return -1;
  };
  removed.sort(
    (a, b) => a.from - b.from || (a.offset ?? -1) - (b.offset ?? -1),
  );
  const removalOf = new Map<TidyItem, TidyRemovalInput>();
  for (const piece of removed) {
    const why: TidyRemoval = {
      reason: piece.removal.reason.replace(/\s+/g, ' ').trim().slice(0, 300),
    };
    let at = 0;
    let item: TidyItem;
    if (piece.html !== undefined) {
      item = {
        type: 'part',
        from: piece.from,
        offset: piece.offset!,
        html: piece.html,
        removed: why,
      };
      const siblings = items
        .map((sibling, index) => ({ sibling, index }))
        .filter(
          (
            entry,
          ): entry is {
            sibling: Extract<TidyItem, { type: 'part' }>;
            index: number;
          } =>
            entry.sibling.type === 'part' && entry.sibling.from === piece.from,
        );
      const before = siblings
        .filter((entry) => entry.sibling.offset < piece.offset!)
        .sort((a, b) => b.sibling.offset - a.sibling.offset)[0];
      const after = siblings
        .filter((entry) => entry.sibling.offset > piece.offset!)
        .sort((a, b) => a.sibling.offset - b.sibling.offset)[0];
      at = before ? before.index + 1 : after ? after.index : items.length;
    } else {
      item = { type: 'block', from: piece.from, removed: why };
      for (let previous = piece.from - 1; previous >= 0; previous--) {
        const index = lastOf(previous);
        if (index >= 0) {
          at = index + 1;
          break;
        }
      }
    }
    items.splice(at, 0, item);
    removalOf.set(item, piece.removal);
  }

  const itemText = (item: TidyItem) =>
    item.type === 'block'
      ? tidyBlockText(stored[item.from]!)
      : item.type === 'part'
        ? tidyHtmlText(item.html)
        : item.type === 'heading'
          ? item.text
          : '';
  const find = (quote: string, removedToo: boolean) => {
    const loose = looseText(quote);
    if (!loose) return -1;
    const index = items.findIndex(
      (item) =>
        !(item.type === 'block' || item.type === 'part'
          ? item.removed
          : false) && looseText(itemText(item)).includes(loose),
    );
    return index >= 0 || !removedToo
      ? index
      : items.findIndex((item) => looseText(itemText(item)).includes(loose));
  };

  for (const [item, removal] of removalOf) {
    if (!removal.duplicateOf || (item.type !== 'block' && item.type !== 'part'))
      continue;
    const index = find(removal.duplicateOf, false);
    if (index >= 0) item.removed!.duplicateOf = index;
    else
      dropped.push(
        `"${short(removal.duplicateOf)}", which a removal repeats, is not in the tidied text.`,
      );
  }

  const comments: TidyComment[] = [];
  for (const input of commentInputs) {
    if (comments.length >= TIDY_COMMENTS_MAX) {
      dropped.push(
        `Only ${TIDY_COMMENTS_MAX} comments are kept: say what matters most.`,
      );
      break;
    }
    const comment = (input.comment ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, TIDY_COMMENT_MAX);
    if (!comment) continue;
    const kind = (TIDY_COMMENT_KINDS as readonly string[]).includes(input.kind)
      ? input.kind
      : 'idea';
    const quote = (input.quote ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const at = quote ? find(quote, true) : -1;
    if (quote && at < 0)
      dropped.push(
        `The comment on "${short(quote)}" is about words not in the text; it is kept for the text as a whole.`,
      );
    comments.push({
      ...(at >= 0 ? { at, quote } : {}),
      kind,
      comment,
    });
  }

  if (!tidyChanges(items) && !comments.length)
    problems.push(
      'Nothing to tidy: the text is in order as it stands. Leave no suggestion.',
    );

  return { keys, items, comments, problems, dropped };
}

/** Whether a tidied text differs from the text it was made from. */
function tidyChanges(items: readonly TidyItem[]): boolean {
  let next = 0;
  for (const item of items) {
    if (item.type !== 'block' || item.removed || item.from !== next)
      return true;
    next++;
  }
  return false;
}

export interface TidyStats {
  /** Blocks moved, by their place in the text as it was. */
  moved: number[];
  /** Blocks split into pieces, by the same. */
  split: number[];
  removed: number;
  headings: number;
  comments: number;
}

/**
 * What a tidy does, in counts. A block counts as moved when it leaves the
 * longest run of blocks still in their order: moving one paragraph up moves
 * one, not every paragraph it jumps over.
 */
export function tidyStats(payload: {
  items: TidyItem[];
  comments: TidyComment[];
}): TidyStats {
  const order: number[] = [];
  const split = new Set<number>();
  const placed = new Set<number>();
  let removed = 0;
  let headings = 0;
  for (const item of payload.items) {
    if (item.type === 'heading' || item.type === 'delimiter') {
      headings += item.type === 'heading' ? 1 : 0;
      continue;
    }
    if (item.removed) {
      removed++;
      if (item.type === 'part') split.add(item.from);
      continue;
    }
    // A split paragraph stands where its first piece kept does.
    if (item.type === 'part') {
      split.add(item.from);
      if (placed.has(item.from)) continue;
      placed.add(item.from);
    }
    order.push(item.from);
  }
  // The longest increasing run stays; the rest moved.
  const tails: number[] = [];
  const tailIndex: number[] = [];
  const previous = new Array<number>(order.length).fill(-1);
  order.forEach((value, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (tails[middle]! < value) low = middle + 1;
      else high = middle;
    }
    tails[low] = value;
    tailIndex[low] = index;
    previous[index] = low ? tailIndex[low - 1]! : -1;
  });
  const staying = new Set<number>();
  for (
    let index = tailIndex[tails.length - 1] ?? -1;
    index >= 0;
    index = previous[index]!
  )
    staying.add(order[index]!);
  return {
    moved: order.filter((from) => !staying.has(from)),
    split: [...split],
    removed,
    headings,
    comments: payload.comments.length,
  };
}

/**
 * Matches a text against the one a tidy was made from: for each block of
 * that text, the block that stands for it now. Blocks changed in place — a
 * word fixed — still match by where they stand between unchanged ones; a
 * block added or taken away leaves the plan meaningless, and there is no
 * match.
 */
export function alignTidyBase(
  blocks: readonly Block[],
  keys: readonly string[],
): { map: number[]; changed: boolean[] } | undefined {
  const hashes = blocks.map(tidyBlockHash);
  const rows = keys.length;
  const columns = hashes.length;
  if (rows !== columns) return undefined;
  const lengths = Array.from({ length: rows + 1 }, () =>
    new Array<number>(columns + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i--)
    for (let j = columns - 1; j >= 0; j--)
      lengths[i]![j] =
        keys[i] === hashes[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
  const map = new Array<number>(rows).fill(-1);
  const changed = new Array<boolean>(rows).fill(false);
  let i = 0;
  let j = 0;
  let gapI = 0;
  let gapJ = 0;
  const closeGap = () => {
    if (i - gapI !== j - gapJ) return false;
    for (let offset = 0; offset < i - gapI; offset++) {
      map[gapI + offset] = gapJ + offset;
      changed[gapI + offset] = true;
    }
    return true;
  };
  while (i < rows && j < columns) {
    if (keys[i] === hashes[j]) {
      if (!closeGap()) return undefined;
      map[i] = j;
      i++;
      j++;
      gapI = i;
      gapJ = j;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i++;
    else j++;
  }
  i = rows;
  j = columns;
  if (!closeGap()) return undefined;
  return { map, changed };
}

/** What the owner chose of a tidy: by item, or by a block's former place. */
export interface TidyChoices {
  /** Headings and delimiters left out. */
  skip?: number[];
  /** Removed pieces kept after all. */
  keep?: number[];
  /** Split paragraphs kept whole. */
  whole?: number[];
  /** Headings in the owner's own words. */
  headings?: Record<number, string>;
}

/**
 * Whether a removed piece of a tidy stays after all: the block in its place
 * has changed since the tidy was made — it is not the repeat any more — or is
 * one a tidy never drops.
 */
export function tidyRemovalStays(
  block: ContentOutputBlock,
  changed: boolean,
): boolean {
  return changed || ALWAYS_KEPT.has(block.type);
}

/**
 * The text a tidy makes of `blocks` — the text as it is now — with what the
 * owner chose. Undefined when the text has moved on too far. A paragraph the
 * tidy splits but which has changed since is kept whole: the cut it named is
 * no longer there; a block it drops but which has changed since stays.
 */
export function applyTidy(
  blocks: readonly ContentOutputBlock[],
  payload: { keys: string[]; items: TidyItem[] },
  choices: TidyChoices = {},
):
  | { blocks: ContentOutputBlock[]; keptWhole: number[]; keptRemoved: number[] }
  | undefined {
  const aligned = alignTidyBase(blocks, payload.keys);
  if (!aligned) return undefined;
  const whole = new Set(choices.whole);
  for (const item of payload.items)
    if (item.type === 'part' && aligned.changed[item.from])
      whole.add(item.from);
  const keep = new Set(choices.keep);
  const skip = new Set(choices.skip);
  const used = new Set(blocks.map((block) => block.id).filter(Boolean));
  const fresh = () => {
    let id = newEditBlockId();
    while (used.has(id)) id = newEditBlockId();
    used.add(id);
    return id;
  };
  const placedWhole = new Set<number>();
  const pieced = new Set<number>();
  const keptRemoved: number[] = [];
  const result: ContentOutputBlock[] = [];
  payload.items.forEach((item, index) => {
    switch (item.type) {
      case 'block': {
        const block = blocks[aligned.map[item.from]!]!;
        if (item.removed && !keep.has(index)) {
          if (!tidyRemovalStays(block, Boolean(aligned.changed[item.from])))
            return;
          keptRemoved.push(index);
        }
        result.push(block);
        return;
      }
      case 'part': {
        const source = blocks[aligned.map[item.from]!]!;
        if (whole.has(item.from)) {
          if (!placedWhole.has(item.from)) {
            placedWhole.add(item.from);
            result.push(source);
          }
          return;
        }
        if (item.removed && !keep.has(index)) return;
        // The first piece keeps the paragraph's id, so an editor knows it.
        const id = !pieced.has(item.from) && source.id ? source.id : fresh();
        pieced.add(item.from);
        result.push({
          ...source,
          id,
          data: { ...source.data, text: item.html },
        });
        return;
      }
      case 'heading': {
        if (skip.has(index)) return;
        const text = (choices.headings?.[index] ?? item.text)
          .replace(/\s+/g, ' ')
          .trim();
        if (!text) return;
        result.push({
          id: fresh(),
          type: 'header',
          data: {
            text: escapeHtmlText(text.slice(0, TIDY_HEADING_MAX)),
            level: item.level,
          },
        });
        return;
      }
      case 'delimiter':
        if (skip.has(index)) return;
        result.push({ id: fresh(), type: 'delimiter', data: {} });
    }
  });
  return { blocks: result, keptWhole: [...whole], keptRemoved };
}
