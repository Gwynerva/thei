import type { ProjectEventAccessLevel } from '../access-level';
import type { ContentFieldValue } from '../content';
import type { MediaDescriptor } from '../media';
import type { PaginatedResponse } from '../pagination';
import type { RelationGetItem } from '../relation';

export type DiaryGetResponse = {
  diaryUuid: string;
  date: string;
  access: ProjectEventAccessLevel;
  content: ContentFieldValue;
  relations: RelationGetItem[];
  reminder: string;
  notes?: ContentFieldValue;
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

export type DiaryListResponse = PaginatedResponse<DiaryListItem>;
