import type { ReferenceElement } from '@floating-ui/vue';
import type { ContentEntityReference } from '#layers/thei/shared/content-link';
import type { InlineLinkAttributes } from './editor-inline-link-dom';

/**
 * What an inline tool hands its popup: where to stand, what is already there,
 * and the three things the popup may do with the selection the tool holds.
 */
export interface ContentInlineMarkupRequest {
  anchor: ReferenceElement;
  /** Whether the selection is inside an element of this kind already. */
  existing: boolean;
  remove: () => void;
  /**
   * Gives the selection back as it was, with the tool's highlight removed.
   * Safe to call more than once; only the first call does anything.
   */
  restore: () => void;
}

export interface ContentInlineLinkRequest extends ContentInlineMarkupRequest {
  initialUrl?: string;
  /** The note already attached to this link, if it is being edited. */
  initialNote?: string;
  /** The entity an internal link being edited points to. */
  initialEntity?: ContentEntityReference;
  apply: (label: string, attributes: InlineLinkAttributes) => void;
}

export interface ContentInlineLinkControlsExpose {
  openEntity: (request: ContentInlineLinkRequest) => void;
  openExternal: (request: ContentInlineLinkRequest) => void;
}

/** The same shape for the hint tool: a note attached to a span of text. */
export interface ContentHintRequest extends ContentInlineMarkupRequest {
  initialText: string;
  apply: (text: string) => void;
}

export interface ContentHintControlsExpose {
  open: (request: ContentHintRequest) => void;
}
