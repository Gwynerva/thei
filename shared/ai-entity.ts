import type { AiActionItem, AiEntityRef, AiSessionItem } from './ai';
import type { AiPresetItem } from './ai-template';
import type { AiEntityMemory } from './ai-memory';
import type { ContentSlot } from './content';

/**
 * What an entity's form shows of the AI: what it remembers of the entity
 * and of its parts, the proposals that wait for it — each where the form
 * shows it — the sessions about it, and the templates to start from it.
 */

/**
 * Where a form shows a proposal: at the label of a field (`field:title`),
 * of its dates, of who may see it or of one of its texts (`text:<slot>`),
 * among its tags or relations, or at the head of the form — a change of
 * several fields, or one the form cannot take in itself.
 */
export type AiOfferPlace =
  | `field:${string}`
  | 'periods'
  | 'access'
  | 'tags'
  | 'relations'
  | `text:${ContentSlot}`
  | 'form';

/** A proposal that waits for an entity, where its form shows it. */
export interface AiEntityOffer {
  action: AiActionItem;
  place: AiOfferPlace;
  /** The session it was proposed in. */
  session: { sessionUuid: string; title: string };
}

/** A part of an entity — a section, a file — that the AI remembers things of. */
export interface AiEntityPartMemory {
  entity: AiEntityRef;
  count: number;
}

export interface AiEntityPanel {
  memory: AiEntityMemory;
  parts: AiEntityPartMemory[];
  offers: AiEntityOffer[];
  /** The latest sessions about it, and how many there are in all. */
  sessions: AiSessionItem[];
  sessionCount: number;
  /** Ready-made requests offered for this kind of entity, with their words. */
  templates: AiPresetItem[];
  /** Whether a model is set to answer a session started here. */
  modelReady: boolean;
}
