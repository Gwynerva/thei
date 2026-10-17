import type { ContentEntityType } from '../content-link';
import type { ContentHeadingLevel } from '../content-headings';

/**
 * Where inside an entity a link may lead: the headings of the text its page
 * shows, each by its anchor, and for a project its sections, each a level
 * of its own. A picker reads it to go down from an entity to a heading.
 */
export interface ContentEntityOutline {
  entityType: ContentEntityType;
  entityId: string;
  title: string;
  headings: ContentOutlineHeading[];
  /** A project's sections: the general ones in their order, then the stages. */
  sections?: ContentOutlineSection[];
  /** A section's project. */
  parent?: { entityId: string; title: string };
}

export interface ContentOutlineHeading {
  /** Its anchor: what the link names after `#`. */
  id: string;
  title: string;
  level: ContentHeadingLevel;
  /** Inside a private section: only the owner sees it. */
  private: boolean;
}

export interface ContentOutlineSection {
  entityId: string;
  title: string;
  /** For a stage: its number from the oldest, and how many there are. */
  stage?: { number: number; count: number };
}
