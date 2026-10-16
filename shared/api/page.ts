import type { ProjectEventAccessLevel } from '../access-level';
import type { PaginatedResponse } from '../pagination';
import type { ContentFieldValue, PublicContentOutputData } from '../content';
import type { MediaDescriptor } from '../media';

export type PageGetResponse = {
  pageUuid: string;
  /** When the entity last changed; a save names it back. */
  version: number;
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  iconAssetUuid?: string;
  iconMedia?: MediaDescriptor;
  iconAssetSize?: number;
  content: ContentFieldValue;
  reminder: string;
  /** Other names it is found by; only the owner sees them. */
  synonyms: string[];
  notes?: ContentFieldValue;
};

export type PageSaveResponse =
  | { type: 'success'; pageUuid: string; slug: string; version: number }
  | { type: 'error'; message: string; code?: 'slug-taken' | 'changed' };

export type PageListItem = {
  pageUuid: string;
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  iconMedia: MediaDescriptor;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
  /** The owner-only reminder, when one is set. */
  reminder?: string;
};

export type PageListResponse = PaginatedResponse<PageListItem>;

export type PublicPageListItem = {
  title: string;
  summary: string;
  href: string;
  access: ProjectEventAccessLevel;
  iconMedia: MediaDescriptor;
  updatedAt: string;
};

export type PublicPageResponse = {
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  chronology: {
    createdAt: string;
    updatedAt?: string;
  };
  iconMedia: MediaDescriptor;
  content: PublicContentOutputData;
  /**
   * Owner only. A visitor never receives either field — not here, not in the
   * Markdown representation, not in search.
   */
  reminder?: string;
  notes?: PublicContentOutputData;
};
