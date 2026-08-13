import type { ReferenceElement } from '@floating-ui/vue';

export interface ContentInlineLinkRequest {
  anchor: ReferenceElement;
  existing: boolean;
  initialUrl?: string;
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
