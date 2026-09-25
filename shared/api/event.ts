import type { ProjectEventAccessLevel } from '../access-level';
import type { ContentFieldValue } from '../content';
import type { DatedPeriod } from '../date-precision';
import type { ProjectActionEditData } from '../project-action';
import type { OtherAssetGetItem } from './project';
import type { ExternalLink, ProjectExternalLink } from '../external-link';
import type { TagItem } from '../tag';
import type { MediaDescriptor } from '../media';
import type { AdminPaginatedResponse } from '../admin/entity-list';
import type { RelationGetItem } from '../relation';

export type EventGetResponse = {
  eventUuid: string;
  title: string;
  summary: string;
  access: ProjectEventAccessLevel;
  humanReadableSlug: string;
  publicId: string;
  periods: DatedPeriod[];
  content: ContentFieldValue;
  reminder: string;
  notes?: ContentFieldValue;
  otherAssets: OtherAssetGetItem[];
  externalLinks: ProjectExternalLink[];
  tags: TagItem[];
  relations: RelationGetItem[];
  action: ProjectActionEditData;
  actionIconMedia?: MediaDescriptor;
  actionIconAssetSize?: number;
  actionBackgroundMedia?: MediaDescriptor;
  actionBackgroundAssetSize?: number;
  actionFileMedia?: MediaDescriptor;
  actionFileExtension?: string;
  actionFileSize?: number;
  /** The stored record of the action button's link, when there is one. */
  actionLink?: ExternalLink;
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
  /** The owner-only reminder, when one is set. */
  reminder?: string;
};

export type EventListResponse = AdminPaginatedResponse<EventListItem>;

export type PublicEventResponse = Pick<
  EventGetResponse,
  'title' | 'summary' | 'periods' | 'humanReadableSlug' | 'publicId' | 'access'
>;
