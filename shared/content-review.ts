import {
  contentBlockTextParts,
  type ContentOutputBlock,
  type ContentOutputData,
} from './content';
import type { AiRevisePart, AiRevisePartState } from './ai-actions';
import type { ProofreadCategory, TidyItem } from './ai-revise';
import { diffContentBlocks, type ContentTextDiffPart } from './content-diff';
import { newEditBlockId } from './content-edit-markdown/block-key';
import { escapeHtmlText } from './content-edit-markdown/html';
import {
  placeTextEdits,
  type TextEditPlace,
} from './content-edit-markdown/patch-core';
import { alignTidyBase, tidyRemovalStays } from './content-edit-markdown/tidy';
import {
  applyRevise,
  orderChoices,
  takenParts,
  type Correction,
} from './content-revise';

/**
 * A change to a text, seen part by part before it is made: an AI's edit of
 * it, or another version of it — a draft, a version from the history —
 * against the text as it is. Each part is taken or left as it is, and
 * nothing changes until the result is taken. One model drives every way of
 * showing it: the text as it will read, what goes and what comes, and a list.
 */

/** The owner's word on a part: none yet, taken, or left as it is. */
export type ReviewDecision = 'pending' | 'accepted' | 'kept';

export const REVIEW_VIEWS = ['read', 'diff', 'list'] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];

/**
 * Characters no text holds, set around a part's words in a text being shown,
 * for the page to find them once it is drawn: the part's id between `open`
 * and `id`, and, where both states are shown, what is now after `was` and
 * what comes after `becomes`, up to `close`.
 */
export const REVIEW_MARK = {
  open: '',
  id: '',
  was: '',
  becomes: '',
  close: '',
} as const;

export type ReviewPartKind =
  | ProofreadCategory
  /** Of a version: a block it has otherwise, has only, or has not. */
  | 'changed'
  | 'added'
  | 'removed'
  /**
   * Of a new order: a heading or a delimiter added, a repeat dropped, a
   * paragraph split, the blocks moved.
   */
  | 'heading'
  | 'delimiter'
  | 'removal'
  | 'split'
  | 'order';

export interface ReviewPart {
  id: string;
  kind: ReviewPartKind;
  /** Taken with the sure ones at once; an unsure one is the owner's call. */
  sure: boolean;
  reason: string;
  /** Words in a line: what they are, what they become, the words around. */
  words?: { before: string; after: string; around: [string, string] };
  /** A whole block's words compared, for a block another version rewrote. */
  diff?: ContentTextDiffPart[];
  /** A whole block that comes or goes: its words, for a line about it. */
  quote?: string;
  /** A whole block: its mark is on the margin, not in a line. */
  whole: boolean;
  /** Words outside the running text: a caption, a title, a note. */
  aside: boolean;
  /** Where words outside the running text stand. */
  place?: 'caption' | 'file' | 'link';
  /** The heading it stands under, for a list grouped by them. */
  heading?: string;
  /** Inside a private part of the text. */
  private: boolean;
  /** Settled already — made, or no longer in the text: shown, not decided. */
  settled?: 'applied' | 'stale';
}

/** One row of the text as a review shows it. */
export type ReviewRow =
  | {
      type: 'block';
      block: ContentOutputBlock;
      /** Parts in it shown on its margin: words outside its running text. */
      parts: string[];
      /** The part the whole block is: drawn tinted as it is decided. */
      part?: string;
      /** A block a version rewrote, shown as its words compared. */
      diff?: ContentTextDiffPart[];
      /** Shown as it is now, struck: what a part would take away. */
      was?: boolean;
    }
  /** A block a part takes away, folded to a line in the text as it will read. */
  | { type: 'gone'; part: string; quote: string }
  | { type: 'edge'; edge: 'start' | 'end' };

export interface ContentReview {
  parts: ReviewPart[];
  rows(
    decisions: Readonly<Record<string, ReviewDecision>>,
    view: ReviewView,
  ): ReviewRow[];
  /** The text with the parts taken. */
  result(
    decisions: Readonly<Record<string, ReviewDecision>>,
  ): ContentOutputData;
}

/** Blocks whose words are drawn as a run of text, where a mark can stand. */
const RUNNING_TEXT = new Set(['paragraph', 'header', 'quote', 'list']);

/** Where words outside the running text stand, by their block. */
const ASIDE_PLACES: Record<string, ReviewPart['place']> = {
  contentMedia: 'caption',
  contentGallery: 'caption',
  contentAudio: 'file',
  contentAttachment: 'file',
  externalLink: 'link',
  entityLink: 'link',
};
/** Words around a correction, shown with it. */
const AROUND = 40;

function tail(text: string) {
  const words = text.replace(/\s+/g, ' ');
  if (words.length <= AROUND) return words;
  const cut = words.slice(-AROUND);
  return `…${cut.slice(cut.indexOf(' ') + 1)}`;
}

function head(text: string) {
  const words = text.replace(/\s+/g, ' ');
  if (words.length <= AROUND) return words;
  const cut = words.slice(0, AROUND);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

function blockWords(block: ContentOutputBlock) {
  return contentBlockTextParts(block).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * For each block, the heading it stands under, whether it is private, and
 * the private section it is in.
 */
function outline(blocks: ContentOutputBlock[]) {
  let heading: string | undefined;
  let section: string | undefined;
  return blocks.map((block) => {
    if (block.type === 'privateSectionBoundary') {
      const data = block.data as { edge?: string; sectionId?: string };
      section = data.edge === 'end' ? undefined : (data.sectionId ?? '');
    }
    const place = {
      heading,
      private: section !== undefined,
      ...(section !== undefined ? { section } : {}),
    };
    if (block.type === 'header') heading = blockWords(block);
    return block.type === 'header' ? { ...place, heading } : place;
  });
}

/** A piece of the text a review makes, and the private section it falls in. */
interface Placed<T> {
  item: T;
  /** The private section it is in; none for a public piece. */
  section?: string;
}

/**
 * Pieces in order, with the edges of private sections drawn around each run
 * of private ones: a piece is never out of the section it is in, and two
 * runs never share a section's id.
 */
function withPrivateEdges<T>(
  pieces: readonly Placed<T>[],
  edge: (sectionId: string, side: 'start' | 'end') => T,
): T[] {
  const out: T[] = [];
  const used = new Set<string>();
  let run: { source: string; id: string } | undefined;
  for (const piece of pieces) {
    if (run && piece.section !== run.source) {
      out.push(edge(run.id, 'end'));
      run = undefined;
    }
    if (piece.section !== undefined && !run) {
      let id = piece.section || newEditBlockId();
      while (used.has(id)) id = newEditBlockId();
      used.add(id);
      run = { source: piece.section, id };
      out.push(edge(id, 'start'));
    }
    out.push(piece.item);
  }
  if (run) out.push(edge(run.id, 'end'));
  return out;
}

function edgeOf(block: ContentOutputBlock): 'start' | 'end' {
  return (block.data as { edge?: string }).edge === 'end' ? 'end' : 'start';
}

/** The start of a part's mark: its id, set off. */
const markOpen = (id: string) => `${REVIEW_MARK.open}${id}${REVIEW_MARK.id}`;

// ---- An AI's corrections of words ---------------------------------------------

/** The stored markup a correction puts where its words stand. */
function replacementFor(part: Correction, place: TextEditPlace) {
  return place.html
    ? part.replaceHtml
    : place.escaped
      ? escapeHtmlText(part.replacePlain)
      : part.replacePlain;
}

/** The owner's word on a part, as the shared rules read it. */
const decisionIn =
  (decisions: Readonly<Record<string, ReviewDecision>>) => (id: string) =>
    decisions[id] ?? 'pending';

/**
 * An AI's corrections of a text's words, over the text as it is. A correction
 * whose words no longer stand in it once is shown as settled, with what the
 * action says of it.
 */
export function proofreadReview(
  base: ContentOutputData,
  parts: readonly AiRevisePart[],
  states: ReadonlyMap<string, AiRevisePartState> = new Map(),
): ContentReview {
  const corrections = parts.filter(
    (part): part is Correction => part.type === 'correction',
  );
  const waiting = corrections.filter((part) => {
    const state = states.get(part.id);
    return state !== 'applied' && state !== 'stale';
  });
  const { places } = placeTextEdits(base, waiting, (_id, stored) => stored);
  const layout = outline(base.blocks);

  const reviewParts: ReviewPart[] = corrections.map((part) => {
    const place = places.get(part.id);
    const state = states.get(part.id);
    const block = place ? base.blocks[place.block] : undefined;
    return {
      id: part.id,
      kind: part.category,
      sure: part.certainty === 'sure',
      reason: part.reason,
      words: {
        before: part.find,
        after: part.replacePlain,
        around: place ? [tail(place.before), head(place.after)] : ['', ''],
      },
      whole: false,
      aside: Boolean(block && !RUNNING_TEXT.has(block.type)),
      ...(block && ASIDE_PLACES[block.type]
        ? { place: ASIDE_PLACES[block.type] }
        : {}),
      heading: place ? layout[place.block]?.heading : undefined,
      private: place ? Boolean(layout[place.block]?.private) : false,
      ...(state === 'applied' || state === 'stale'
        ? { settled: state }
        : place
          ? {}
          : { settled: 'stale' as const }),
    };
  });
  // In the order they stand in the text; what is settled after the rest.
  const standing = (id: string) => {
    const place = places.get(id);
    return place
      ? place.block * 1_000_000 + place.before.length
      : Number.MAX_SAFE_INTEGER;
  };
  reviewParts.sort((left, right) => standing(left.id) - standing(right.id));
  const placed = waiting.filter((part) => places.has(part.id));
  const asideOf = new Map(
    reviewParts.filter((part) => part.aside).map((part) => [part.id, part]),
  );

  return {
    parts: reviewParts,
    rows(decisions, view) {
      const aside = new Map<number, string[]>();
      const { data } = placeTextEdits(base, placed, (id, stored, place) => {
        const part = placed.find((each) => each.id === id)!;
        const kept = decisions[id] === 'kept';
        const after = replacementFor(part, place);
        if (asideOf.has(id)) {
          aside.set(place.block, [...(aside.get(place.block) ?? []), id]);
          return kept ? stored : after;
        }
        if (kept) return `${markOpen(id)}${stored}${REVIEW_MARK.close}`;
        return view === 'diff'
          ? `${markOpen(id)}${REVIEW_MARK.was}${stored}${REVIEW_MARK.becomes}${after}${REVIEW_MARK.close}`
          : `${markOpen(id)}${after}${REVIEW_MARK.close}`;
      });
      return data.blocks.map((block, index): ReviewRow =>
        block.type === 'privateSectionBoundary'
          ? { type: 'edge', edge: edgeOf(block) }
          : { type: 'block', block, parts: aside.get(index) ?? [] },
      );
    },
    result(decisions) {
      const taken = new Set(
        placed
          .filter((part) => decisions[part.id] === 'accepted')
          .map((part) => part.id),
      );
      if (!taken.size) return base;
      return (
        applyRevise(base, { mode: 'proofread', parts: placed }, taken)?.data ??
        base
      );
    },
  };
}

// ---- Another version of the text -----------------------------------------------

/**
 * Another version of a text against it as it is: each block the version
 * rewrote, has and the text has not, or has not and the text has, is a part
 * — taken from the version, or left as it is now. Private sections follow
 * the blocks: a block private now stays private, a block taken from the
 * version is private if it was there, and the edges are drawn around what
 * the text ends with, so a part taken never makes a private block public.
 */
export function versionReview(
  current: ContentOutputData,
  version: ContentOutputData,
  options: { formatText?: (text: string) => string } = {},
): ContentReview {
  const items = diffContentBlocks(current, version, options);
  const versionPlaces = outline(version.blocks);
  const currentPlaces = outline(current.blocks);
  const parts: ReviewPart[] = [];
  const partOf = new Map<number, string>();
  /** For each item, where it stands now and where it stands in the version. */
  const places: {
    now?: ReturnType<typeof outline>[number];
    then?: ReturnType<typeof outline>[number];
  }[] = [];
  let versionIndex = 0;
  let currentIndex = 0;
  items.forEach((item, index) => {
    const now =
      item.kind !== 'added' ? currentPlaces[currentIndex++] : undefined;
    const then =
      item.kind !== 'removed' ? versionPlaces[versionIndex++] : undefined;
    places.push({ now, then });
    if (item.kind === 'same' || item.block.type === 'privateSectionBoundary')
      return;
    const at = item.kind === 'removed' ? now : then;
    const id = `v${index}`;
    partOf.set(index, id);
    parts.push({
      id,
      kind: item.kind,
      sure: true,
      reason: '',
      ...(item.kind === 'changed' && item.words ? { diff: item.words } : {}),
      quote: blockWords(item.block),
      whole: true,
      aside: false,
      heading: at?.heading,
      private: Boolean(now?.private || then?.private),
    });
  });

  /** The section a block falls in: now's, or the version's for one taken. */
  const sectionOf = (index: number, taken: boolean) => {
    const { now, then } = places[index]!;
    if (now?.private) return now.section;
    return taken && then?.private ? then.section : undefined;
  };

  /**
   * The text's pieces as the decisions leave them, `shown` taking every part
   * not kept, as the text will read.
   */
  function pieces<T>(
    decisions: Readonly<Record<string, ReviewDecision>>,
    shown: boolean,
    piece: (
      item: (typeof items)[number],
      id: string | undefined,
      taken: boolean,
    ) => T[],
  ): Placed<T>[] {
    const out: Placed<T>[] = [];
    items.forEach((item, index) => {
      if (item.block.type === 'privateSectionBoundary') return;
      const id = partOf.get(index);
      const taken = id
        ? shown
          ? decisions[id] !== 'kept'
          : decisions[id] === 'accepted'
        : true;
      const section = sectionOf(index, taken && item.kind !== 'removed');
      for (const each of piece(item, id, taken))
        out.push({ item: each, ...(section !== undefined ? { section } : {}) });
    });
    return out;
  }

  return {
    parts,
    rows(decisions, view) {
      const placed = pieces<ReviewRow>(decisions, true, (item, id) => {
        if (!id) return [{ type: 'block', block: item.block, parts: [] }];
        const kept = decisions[id] === 'kept';
        if (item.kind === 'changed') {
          if (kept) return [{ type: 'block', block: item.previous, parts: [] }];
          if (view === 'diff' && item.words)
            return [
              {
                type: 'block',
                block: item.block,
                parts: [],
                part: id,
                diff: item.words,
              },
            ];
          if (view === 'diff')
            return [
              {
                type: 'block',
                block: item.previous,
                parts: [],
                part: id,
                was: true,
              },
              { type: 'block', block: item.block, parts: [], part: id },
            ];
          return [{ type: 'block', block: item.block, parts: [], part: id }];
        }
        if (item.kind === 'added')
          return kept
            ? []
            : [{ type: 'block', block: item.block, parts: [], part: id }];
        if (kept) return [{ type: 'block', block: item.block, parts: [] }];
        if (view === 'diff')
          return [
            {
              type: 'block',
              block: item.block,
              parts: [],
              part: id,
              was: true,
            },
          ];
        return [{ type: 'gone', part: id, quote: blockWords(item.block) }];
      });
      return withPrivateEdges(placed, (_id, side) => ({
        type: 'edge',
        edge: side,
      }));
    },
    result(decisions) {
      const placed = pieces<ContentOutputBlock>(
        decisions,
        false,
        (item, _id, taken) => {
          if (item.kind === 'same') return [item.block];
          if (item.kind === 'changed')
            return [taken ? item.block : item.previous];
          if (item.kind === 'added') return taken ? [item.block] : [];
          return taken ? [] : [item.block];
        },
      );
      // An edge of a section the text or the version has is that very block.
      const edges = new Map<string, ContentOutputBlock>();
      for (const block of [...version.blocks, ...current.blocks])
        if (block.type === 'privateSectionBoundary') {
          const data = block.data as { sectionId?: string; edge?: string };
          edges.set(`${data.sectionId ?? ''}:${edgeOf(block)}`, block);
        }
      // A block taken twice — moved in the version and kept where it is
      // now — stands twice, each under an id of its own.
      const ids = new Set<string>();
      const blocks = withPrivateEdges(
        placed,
        (sectionId, edge): ContentOutputBlock =>
          edges.get(`${sectionId}:${edge}`) ??
          ({
            type: 'privateSectionBoundary',
            data: { sectionId, edge },
          } as ContentOutputBlock),
      ).map((block) => {
        if (!block.id) return block;
        if (!ids.has(block.id)) {
          ids.add(block.id);
          return block;
        }
        let id = newEditBlockId();
        while (ids.has(id)) id = newEditBlockId();
        ids.add(id);
        return { ...block, id };
      });
      return { ...current, blocks: blocks as ContentOutputBlock[] };
    },
  };
}

// ---- An AI's new order of the owner's own blocks -------------------------------

type OrderPlan = { keys: string[]; items: TidyItem[] };

/**
 * An AI's new order of a text's own blocks: headings and delimiters added, a
 * literal repeat dropped, a paragraph split, the blocks moved. Every piece of
 * it stands on the moves, when there are any: left as it was, the order
 * leaves the whole text as it is. A text changed too far since the order was
 * made shows it settled.
 */
export function orderReview(
  base: ContentOutputData,
  parts: readonly AiRevisePart[],
  plan: OrderPlan,
  states: ReadonlyMap<string, AiRevisePartState> = new Map(),
): ContentReview {
  const aligned = alignTidyBase(base.blocks, plan.keys);
  const order = parts.find((part) => part.type === 'order');
  const moved = new Set(order?.type === 'order' ? order.moved : []);
  const byItem = new Map<number, string>();
  const bySplit = new Map<number, string>();
  for (const part of parts)
    if (
      part.type === 'heading' ||
      part.type === 'delimiter' ||
      part.type === 'removal'
    )
      byItem.set(part.item, part.id);
    else if (part.type === 'split') bySplit.set(part.from, part.id);
  const sourceOf = (from: number) =>
    aligned ? base.blocks[aligned.map[from]!] : undefined;

  const reviewParts: ReviewPart[] = parts.flatMap((part): ReviewPart[] => {
    if (part.type === 'correction') return [];
    const state = states.get(part.id);
    const source = part.type === 'split' ? sourceOf(part.from) : undefined;
    return [
      {
        id: part.id,
        kind: part.type,
        sure: part.certainty === 'sure',
        reason: part.reason,
        ...(part.type === 'heading'
          ? { quote: part.text }
          : part.type === 'removal'
            ? { quote: part.quote }
            : source
              ? { quote: blockWords(source) }
              : {}),
        whole: true,
        aside: false,
        private: false,
        ...(state === 'applied' || state === 'stale'
          ? { settled: state }
          : aligned
            ? {}
            : { settled: 'stale' as const }),
      },
    ];
  });

  /** As the text will read: every part not kept stands in it. */
  const shownChoices = (decisions: Readonly<Record<string, ReviewDecision>>) =>
    orderChoices(parts, (part) => decisions[part.id] !== 'kept');

  const plainRows = (): ReviewRow[] =>
    base.blocks.map((block): ReviewRow =>
      block.type === 'privateSectionBoundary'
        ? { type: 'edge', edge: edgeOf(block) }
        : { type: 'block', block, parts: [] },
    );

  return {
    parts: reviewParts,
    rows(decisions, view) {
      if (!aligned || (order && decisions[order.id] === 'kept'))
        return plainRows();
      const { skip = [], keep = [], whole = [] } = shownChoices(decisions);
      // A paragraph changed since it was split stays whole, as it applies.
      for (const item of plan.items)
        if (item.type === 'part' && aligned.changed[item.from])
          whole.push(item.from);
      const rows: ReviewRow[] = [];
      const placedWhole = new Set<number>();
      plan.items.forEach((item, index) => {
        if (item.type === 'heading' || item.type === 'delimiter') {
          if (skip.includes(index)) return;
          rows.push({
            type: 'block',
            block: (item.type === 'heading'
              ? {
                  type: 'header',
                  data: { text: escapeHtmlText(item.text), level: item.level },
                }
              : { type: 'delimiter', data: {} }) as ContentOutputBlock,
            parts: [],
            part: byItem.get(index),
          });
          return;
        }
        const source = sourceOf(item.from)!;
        if (source.type === 'privateSectionBoundary') {
          rows.push({ type: 'edge', edge: edgeOf(source) });
          return;
        }
        const kept = item.type === 'part' && whole.includes(item.from);
        if (kept) {
          if (placedWhole.has(item.from)) return;
          placedWhole.add(item.from);
        }
        const piece =
          item.type === 'part' && !kept
            ? ({
                ...source,
                data: { ...source.data, text: item.html },
              } as ContentOutputBlock)
            : source;
        const removal = byItem.get(index);
        // A block changed since the order was made stays, as it applies.
        if (
          item.removed &&
          removal &&
          !keep.includes(index) &&
          !(
            item.type === 'block' &&
            tidyRemovalStays(source, Boolean(aligned.changed[item.from]))
          )
        ) {
          rows.push(
            view === 'diff'
              ? {
                  type: 'block',
                  block: piece,
                  parts: [],
                  part: removal,
                  was: true,
                }
              : { type: 'gone', part: removal, quote: blockWords(piece) },
          );
          return;
        }
        const split =
          item.type === 'part' && !kept ? bySplit.get(item.from) : undefined;
        rows.push({
          type: 'block',
          block: piece,
          parts: [],
          part: split ?? (order && moved.has(item.from) ? order.id : undefined),
        });
      });
      return rows;
    },
    result(decisions) {
      if (!aligned) return base;
      const taken = takenParts({ parts }, decisionIn(decisions));
      if (!taken.size) return base;
      return (
        applyRevise(base, { mode: 'order', parts, plan }, taken)?.data ?? base
      );
    },
  };
}
