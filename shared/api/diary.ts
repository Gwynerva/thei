import type { ProjectEventAccessLevel } from '../access-level';
import type { ContentFieldValue } from '../content';
import type { RelationEditItem } from '../relation';
import type { MediaDescriptor } from '../media';
import type { AdminPaginatedResponse } from '../admin/entity-list';

export type DiaryGetResponse = {
  diaryUuid: string;
  date: string;
  access: ProjectEventAccessLevel;
  content: ContentFieldValue;
  relations: RelationEditItem[];
  reminder: string;
};

export type DiarySaveResponse =
  | { type: 'success'; diaryUuid: string; date: string }
  | { type: 'error'; message: string; code?: 'date-taken' };

export type DiaryListItem = {
  diaryUuid: string;
  date: string;
  access: ProjectEventAccessLevel;
  /** The opening of the entry, which stands in for a title it does not have. */
  excerpt: string;
  previewMedia?: MediaDescriptor;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
  /** The owner-only reminder, when one is set. */
  reminder?: string;
};

export type DiaryListResponse = AdminPaginatedResponse<DiaryListItem>;
