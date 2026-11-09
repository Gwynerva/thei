import type { ContentEntitySearchItem } from '../admin/content-entity-search';
import type { MediaDescriptor } from '../media';

/**
 * An excerpt about an entity, as the entity's own form lists it: read only
 * there, since only its parent's form edits it, and leading to that form.
 */
export type AdminExcerptAbout = {
  excerptUuid: string;
  title: string;
  publicId: string;
  isPrivate: boolean;
  /** What stands for the excerpt: its banner, else the first picture of its text. */
  media?: MediaDescriptor;
  /** The excerpt's parent, described as the picker describes an entity. */
  parent: ContentEntitySearchItem;
  /** The parent's form, opened on the excerpt. */
  editPath: string;
};

/**
 * The excerpts about an entity: what its form lists and what its deletion
 * pane counts before asking what to do with them.
 */
export type AdminExcerptsAboutResponse = {
  items: AdminExcerptAbout[];
};
