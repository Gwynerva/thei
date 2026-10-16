import type { ContentEntityType } from '#layers/thei/shared/content-link';

/**
 * What the link picker is opened on, and what it gives back.
 *
 * `inline` makes a link of words in a text: an entity, a place inside it,
 * or another site, with a note. `block` makes a link block, which may also
 * become a block of its own for an address that has one — a video. `mention`
 * names an entity, or a place inside it, in a message to the AI: no address,
 * no note.
 */
export type ContentLinkPickerMode = 'inline' | 'block' | 'mention';

/** A link being edited: where it leads now. */
export type ContentLinkTarget =
  | {
      kind: 'entity';
      entityType: ContentEntityType;
      entityId: string;
      fragment?: string;
    }
  | { kind: 'external'; url: string };

/** The entity a pick leads to, with what the editor shows of it. */
export interface ContentLinkPickEntity {
  entityType: ContentEntityType;
  entityId: string;
  title: string;
  /** The day of a diary entry, its title. */
  date?: string;
  /** Its address, without the site's base, when known. */
  url?: string;
}

export type ContentLinkPick =
  | {
      kind: 'entity';
      entity: ContentLinkPickEntity;
      /** The anchor of the heading it leads to, if any. */
      fragment?: string;
      /** The heading's words, and the path down to it, for a chip. */
      heading?: string;
      path: string[];
      note?: string;
    }
  | { kind: 'external'; url: string; title: string; note?: string }
  | { kind: 'integration'; url: string };
