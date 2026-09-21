import type { ReferenceElement } from '@floating-ui/vue';

export interface ContentInlineLinkRequest {
  anchor: ReferenceElement;
  existing: boolean;
  initialUrl?: string;
  /** The note already attached to this link, if it is being edited. */
  initialNote?: string;
  apply: (
    label: string,
    attributes: Record<string, string | undefined>,
  ) => void;
  remove: () => void;
  restore: () => void;
}

export interface ContentInlineLinkControlsExpose {
  openProject: (request: ContentInlineLinkRequest) => void;
  openExternal: (request: ContentInlineLinkRequest) => void;
}

/** The same shape for the hint tool: a note attached to a span of text. */
export interface ContentHintRequest {
  anchor: ReferenceElement;
  existing: boolean;
  initialText: string;
  apply: (text: string) => void;
  remove: () => void;
  restore: () => void;
}

export interface ContentHintControlsExpose {
  open: (request: ContentHintRequest) => void;
}
