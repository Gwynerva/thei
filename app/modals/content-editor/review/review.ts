import type { IconName } from '#thei/icons';
import type { AiActionItem } from '#layers/thei/shared/ai';
import type {
  AiRevisePart,
  AiRevisePartState,
} from '#layers/thei/shared/ai-actions';
import type { TidyItem } from '#layers/thei/shared/ai-revise';
import type { ContentOutputData } from '#layers/thei/shared/content';
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

export const REVIEW_VIEW_ICONS: Record<ReviewView, IconName> = {
  read: 'visibility',
  diff: 'compare',
  list: 'list-unordered',
};

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
