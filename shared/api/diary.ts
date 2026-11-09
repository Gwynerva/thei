import type { ProjectEventAccessLevel } from '../access-level';
import type { ContentFieldValue } from '../content';
import type { MediaDescriptor } from '../media';
import type { PaginatedResponse } from '../pagination';
import type { RelationGetItem } from '../relation';
import type { ExcerptValue } from '../excerpt';
import type { ProjectContentItemIdentity } from './project';

export type DiaryGetResponse = {
  diaryUuid: string;
  /** When the entity last changed; a save names it back. */
  version: number;
  date: string;
  access: ProjectEventAccessLevel;
  /** Empty when the day is told by its excerpts alone. */
  content: ContentFieldValue;
  relations: RelationGetItem[];
  excerpts: ExcerptValue[];
  reminder: string;
  notes?: ContentFieldValue;
};

export type DiarySaveResponse =
  | {
      type: 'success';
      diaryUuid: string;
      date: string;
      version: number;
      /** The identities the save gave the entry's excerpts. */
      excerpts: ProjectContentItemIdentity[];
    }
  | { type: 'error'; message: string; code?: 'date-taken' | 'changed' };

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
