import type { ProjectEventAccessLevel } from '../access-level';
import type { ContentFieldValue } from '../content';
import type { DateRange } from '../date-range';
import type { EventProjectRelationEditItem } from '../event';
import type { ProjectActionEditData } from '../project-action';
import type { OtherAssetGetItem } from './project';
import type { ProjectExternalLink } from '../external-link';
import type { TagItem } from '../tag';
import type { MediaDescriptor } from '../media';
import type { AdminPaginatedResponse } from '../admin/entity-list';

export type EventGetResponse = {
  eventUuid: string;
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  periods: DateRange[];
  content: ContentFieldValue;
  otherAssets: OtherAssetGetItem[];
  externalLinks: ProjectExternalLink[];
  relations: EventProjectRelationEditItem[];
  tags: TagItem[];
  action: ProjectActionEditData;
  actionIconMedia?: MediaDescriptor;
  actionIconAssetSize?: number;
  actionBackgroundMedia?: MediaDescriptor;
  actionBackgroundAssetSize?: number;
  actionFileUrl?: string;
  actionFileMedia?: MediaDescriptor;
  actionFileExtension?: string;
  actionFileSize?: number;
  actionFaviconMedia?: MediaDescriptor;
};

export type EventSaveResponse =
  | { type: 'success'; eventUuid: string; action: ProjectActionEditData }
  | { type: 'error'; message: string; code?: 'public-id-taken' };

export type EventListItem = {
  eventUuid: string;
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  previewMedia?: MediaDescriptor;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
};

export type EventListResponse = AdminPaginatedResponse<EventListItem>;

export type PublicEventResponse = Pick<
  EventGetResponse,
  'title' | 'summary' | 'periods' | 'humanReadableSlug' | 'publicId' | 'access'
>;
