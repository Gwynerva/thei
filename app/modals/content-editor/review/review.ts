import type { IconName } from '#thei/icons';
import type { AiActionItem } from '#layers/thei/shared/ai';
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
import {
  orderReview,
  proofreadReview,
  REVIEW_VIEWS,
  type ContentReview,
  type ReviewDecision,
  type ReviewPart,
  type ReviewView,
} from '#layers/thei/shared/content-review';

/** What each kind of part is drawn with. */
const KIND_ICONS: Record<ReviewPart['kind'], IconName> = {
  spelling: 'text',
  grammar: 'text',
  punctuation: 'text',
  case: 'text',
  'missing-letter': 'text',
  link: 'link',
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
export function storedReviewView(): ReviewView {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    return REVIEW_VIEWS.includes(value as ReviewView)
      ? (value as ReviewView)
      : 'read';
  } catch {
    return 'read';
  }
}

export function storeReviewView(view: ReviewView) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // A browser that keeps nothing simply asks again next time.
  }
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
