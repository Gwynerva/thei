import type { ProjectEventAccessLevel } from '../access-level';
import type { AdminPaginatedResponse } from '../admin/entity-list';
import type { ContentFieldValue, PublicContentOutputData } from '../content';
import type { MediaDescriptor } from '../media';
import type { PublicReferences } from './public';

export type PageGetResponse = {
  pageUuid: string;
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  iconAssetUuid?: string;
  iconMedia?: MediaDescriptor;
  iconAssetSize?: number;
  content: ContentFieldValue;
};

export type PageSaveResponse =
  | { type: 'success'; pageUuid: string; slug: string }
  | { type: 'error'; message: string; code?: 'slug-taken' };

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
};

export type PageListResponse = AdminPaginatedResponse<PageListItem>;

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
  references: PublicReferences;
};
