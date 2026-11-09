import type { IconName } from '#thei/icons';
import type { AiActionItem, AiReviewText } from '#layers/thei/shared/ai';
import type {
  AiRevisePart,
  AiRevisePartState,
} from '#layers/thei/shared/ai-actions';
import type { TidyItem } from '#layers/thei/shared/ai-revise';
import {
  contentBlockFiles,
  type ContentOutputBlock,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import type { BlockChange } from '#layers/thei/shared/content-block-changes';
import { contentToEditMarkdown } from '#layers/thei/shared/content-edit-markdown/serialize';
import { escapeHtmlText } from '#layers/thei/shared/content-edit-markdown/html';
import {
  orderReview,
  proofreadReview,
  REVIEW_VIEWS,
  versionReview,
  type ContentReview,
  type ReviewDecision,
  type ReviewPart,
  type ReviewRow,
  type ReviewView,
} from '#layers/thei/shared/content-review';
import { browserStorage } from '#layers/thei/app/composables/browser-storage';

/** What each kind of part is drawn with. */
const KIND_ICONS: Record<ReviewPart['kind'], IconName> = {
  spelling: 'text',
  grammar: 'text',
  punctuation: 'text',
  case: 'text',
  'missing-letter': 'text',
  link: 'link',
  repeat: 'arrow-cycle',
  logic: 'question',
  contradiction: 'warning',
  clumsy: 'thought',
  changed: 'edit',
  added: 'plus',
  removed: 'minus',
  heading: 'heading',
  delimiter: 'minus',
  removal: 'delete',
  split: 'scissors',
  order: 'collapse-vertical',
};

export function reviewPartIcon(part: Pick<ReviewPart, 'kind'>): IconName {
  return KIND_ICONS[part.kind];
}

/**
 * How a part's quoted block is marked: struck for one that goes, marked
 * new for one that comes, plain for one that stays and changes elsewhere.
 */
export function reviewQuoteMark(
  part: Pick<ReviewPart, 'kind'>,
): 'removed' | 'added' | undefined {
  if (part.kind === 'removed' || part.kind === 'removal') return 'removed';
  if (
    part.kind === 'added' ||
    part.kind === 'heading' ||
    part.kind === 'delimiter'
  )
    return 'added';
  return undefined;
}

export const REVIEW_VIEW_ICONS: Record<ReviewView, IconName> = {
  read: 'visibility',
  diff: 'compare',
  list: 'list-unordered',
};

/** Extensions a line about a block names before it trails off. */
const NAMED_FILES = 5;

/**
 * What a block holds besides its words, for a line about it: its files by
 * their extensions, or a delimiter by its kind. A block whose words say it
 * all gets nothing.
 */
export function describeReviewBlock(block: ContentOutputBlock): string {
  if (block.type === 'delimiter')
    return phrase.value.content_editor_i18n.delimiter;
  const files = contentBlockFiles(block);
  if (!files.length) return '';
  const extensions = files.flatMap((file) => {
    const extension = (file as { extension?: unknown } | null)?.extension;
    return typeof extension === 'string' && extension
      ? [extension.toUpperCase()]
      : [];
  });
  const named = extensions.slice(0, NAMED_FILES).join(', ');
  return phrase.value.ai_review_files(
    files.length,
    extensions.length > NAMED_FILES ? `${named}, …` : named,
  );
}

/** A kind of block by the name the editor gives it; none for the rest. */
function blockName(type: string) {
  const names = phrase.value.content_editor_i18n;
  return (
    (
      {
        paragraph: names.text,
        header: names.heading,
        quote: names.quote,
        list: names.list,
        delimiter: names.delimiter,
      } as Record<string, string>
    )[type] ?? ''
  );
}

/** A list's style by the name the editor gives it. */
function listStyleName(style: string) {
  const names = phrase.value.content_editor_i18n;
  return (
    (
      {
        unordered: names.unordered,
        ordered: names.ordered,
        checklist: names.checklist,
      } as Record<string, string>
    )[style] ?? style
  );
}

/** What changed in a block besides its words, in a few words. */
export function reviewChangeWords(change: BlockChange): string {
  const said = phrase.value.ai_review_changes;
  switch (change.what) {
    case 'type':
      return said.type(blockName(change.from), blockName(change.to));
    case 'level':
      return said.level(change.from, change.to);
    case 'style':
      return said.style(listStyleName(change.from), listStyleName(change.to));
    case 'spoiler':
      return said.spoiler(change.on);
    default:
      return said[change.what];
  }
}

/**
 * What a part changes besides the words it shows, in a line: a block's
 * level, style or files, the blocks a new order moves, the paragraphs a
 * split makes.
 */
export function reviewChangesLine(part: ReviewPart): string {
  return [
    ...(part.changes ?? []).map(reviewChangeWords),
    ...(part.moved ? [phrase.value.ai_review_moved(part.moved)] : []),
    ...(part.pieces ? [phrase.value.ai_review_split_into(part.pieces)] : []),
  ].join(' · ');
}

const VIEW_KEY = 'thei-review-view';

/** The owner's way of going through an edit, kept in this browser for all. */
/**
 * Until the owner picks one: what goes and what comes, so a correction is
 * seen with what it replaces — a letter changed is no change to the eye
 * when only the corrected words are shown.
 */
const DEFAULT_VIEW: ReviewView = 'diff';

export function storedReviewView(): ReviewView {
  const value = browserStorage.read(VIEW_KEY);
  return REVIEW_VIEWS.includes(value as ReviewView)
    ? (value as ReviewView)
    : DEFAULT_VIEW;
}

/** A browser that keeps nothing simply asks again next time. */
export function storeReviewView(view: ReviewView) {
  browserStorage.write(VIEW_KEY, view);
}

/** The owner's word on an edit's parts so far, as its action keeps it. */
export function storedDecisions(
  action: Pick<AiActionItem, 'parts'>,
): Record<string, ReviewDecision> {
  const decided: Record<string, ReviewDecision> = {};
  for (const part of action.parts ?? [])
    if (part.state === 'accepted' || part.state === 'kept')
      decided[part.id] = part.state;
  return decided;
}

/** A comment to one part of an edit, saying which words it is about. */
export function partComment(
  review: ContentReview,
  partId: string,
  words: string,
): string {
  const part = review.parts.find((item) => item.id === partId);
  if (part?.link?.made)
    return `A link on «${part.link.words}» → ${part.link.to ?? 'an entity'}: ${words}`;
  if (part?.words)
    return `«${part.words.before}» → «${part.words.after}»: ${words}`;
  if (part?.link)
    return `The link «${part.link.words}» → ${part.link.from ?? 'what it led to is gone'} → ${part.link.to ?? 'no link'}: ${words}`;
  return words;
}

/** An edit's parts that still wait: neither made, kept as they were, nor gone. */
export function waitingParts(action: AiActionItem): AiRevisePart[] {
  const parts = (action.payload as { parts?: AiRevisePart[] }).parts ?? [];
  const states = new Map(
    (action.parts ?? []).map((part) => [part.id, part.state]),
  );
  return parts.filter((part) => {
    const state = states.get(part.id) ?? 'pending';
    return state === 'pending' || state === 'accepted';
  });
}

/**
 * The review of an AI's text edit over a text: corrections of its words, or
 * a new order of its blocks, each part as the action says it stands.
 */
export function textEditReview(
  action: AiActionItem,
  text: ContentOutputData,
): ContentReview {
  const payload = action.payload as {
    mode: 'proofread' | 'relink' | 'order';
    parts: AiRevisePart[];
    plan?: { keys: string[]; items: TidyItem[] };
  };
  const states = new Map(
    (action.parts ?? []).map((part) => [
      part.id,
      part.state as AiRevisePartState,
    ]),
  );
  return payload.mode === 'order' && payload.plan
    ? orderReview(text, payload.parts, payload.plan, states)
    : proofreadReview(text, payload.parts, states);
}

/** A text written whole, gone through over the text it is written into. */
export interface WrittenReview {
  review: ContentReview;
  /**
   * The words each text is to be written with, by its key, the blocks left
   * out gone; a text taken whole is not named.
   */
  texts(
    decisions: Readonly<Record<string, ReviewDecision>>,
  ): Record<string, string>;
}

/** What a new entity's text is, at the head of it. */
function writtenTitle(text: NonNullable<AiReviewText['written']>[number]) {
  if (text.section !== undefined)
    return phrase.value.ai_review_written_section(publicText(text.section));
  return fieldName(text.field ?? 'body');
}

/**
 * The review of a text written whole: each block it brings, changes or
 * takes away is a part, as another version of the text would be. A new
 * entity's texts are gone through as one, each under its name.
 */
export function writtenReview(text: AiReviewText): WrittenReview | undefined {
  const written = text.written ?? [];
  if (!written.length) return undefined;
  const appends = (text.action.payload as { mode?: string }).mode === 'append';
  const before = new Set(text.data.blocks.map((block) => block.id));
  const many = written.length > 1;
  const pieces = written.map((each, index) => ({
    key: each.key,
    title: many ? writtenTitle(each) : '',
    prefix: many ? `t${index}:` : '',
    review: versionReview(text.data, each.proposed, {
      formatText: publicText,
      describeBlock: describeReviewBlock,
    }),
  }));
  /** A piece's own decisions, by its parts' own ids. */
  const own = (
    piece: (typeof pieces)[number],
    decisions: Readonly<Record<string, ReviewDecision>>,
  ) =>
    Object.fromEntries(
      piece.review.parts.map((part) => [
        part.id,
        decisions[piece.prefix + part.id] ?? 'pending',
      ]),
    );
  const marked = (piece: (typeof pieces)[number], id: string) =>
    piece.prefix + id;
  const review: ContentReview = many
    ? {
        parts: pieces.flatMap((piece) =>
          piece.review.parts.map((part) => ({
            ...part,
            id: marked(piece, part.id),
            heading: part.heading ?? piece.title,
          })),
        ),
        rows: (decisions, view) =>
          pieces.flatMap((piece, index): ReviewRow[] => [
            {
              type: 'block',
              block: {
                id: `written-${index}`,
                type: 'header',
                data: { text: escapeHtmlText(piece.title), level: 2 },
              } as ContentOutputBlock,
              parts: [],
            },
            ...piece.review
              .rows(own(piece, decisions), view)
              .map((row): ReviewRow =>
                row.type === 'block'
                  ? {
                      ...row,
                      parts: row.parts.map((id) => marked(piece, id)),
                      ...(row.part ? { part: marked(piece, row.part) } : {}),
                    }
                  : row.type === 'gone'
                    ? { ...row, part: marked(piece, row.part) }
                    : row,
              ),
          ]),
        // Each text has a result of its own: `texts` gives them.
        result: (decisions) =>
          pieces[0]!.review.result(own(pieces[0]!, decisions)),
      }
    : pieces[0]!.review;
  return {
    review,
    texts(decisions) {
      const out: Record<string, string> = {};
      for (const piece of pieces) {
        const mine = own(piece, decisions);
        if (Object.values(mine).every((decision) => decision === 'accepted'))
          continue;
        const blocks = piece.review.result(mine).blocks;
        // Added after the text, it is written of the blocks it brings alone.
        out[piece.key] = contentToEditMarkdown({
          blocks: appends
            ? blocks.filter((block) => !block.id || !before.has(block.id))
            : blocks,
        });
      }
      return out;
    },
  };
}
