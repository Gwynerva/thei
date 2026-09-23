import type { ProjectEventAccessLevel } from '../access-level';
import type { ArchivedOriginalFileMeta, AssetType } from '../asset';
import type { ContentFieldValue } from '../content';
import type {
  ProjectSectionContentValue,
  ProjectStageContentValue,
} from '../project-content-item';
import type { RelationGetItem } from '../relation';
import type { MediaDescriptor } from '../media';
import type { TagItem } from '../tag';
import type { ProjectExternalLink } from '../external-link';
import type { ProjectActionEditData } from '../project-action';
import type { AdminPaginatedResponse } from '../admin/entity-list';
import type { ProfileHistoryPage } from '../profile';
import type { StatusHistoryItem } from '../status';

/** Base display item for any project asset list (showcase, other-assets, …). */
export type AssetListItem = {
  assetUuid: string;
  media: MediaDescriptor;
  /** Stored (processed) file size in bytes. */
  size: number;
};

export type ShowcaseAssetGetItem = AssetListItem & {
  type: AssetType;
  caption?: string;
  isPrivate: boolean;
};

/** Display item for the "Other files" list. media is absent for non-image/video files. */
export type OtherAssetGetItem = {
  assetUuid: string;
  media?: MediaDescriptor;
  /** Canonical download URL. Always set — used for the View button. */
  assetUrl: string;
  size: number;
  extension: string;
  archivedOriginal?: ArchivedOriginalFileMeta;
  title: string;
  caption?: string;
  isPrivate: boolean;
};

export type ProjectGetResponse = {
  projectUuid: string;
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  access: ProjectEventAccessLevel;
  showcase: boolean;
  cv: boolean;
  iconAssetUuid?: string;
  iconMedia?: MediaDescriptor;
  /** Stored file size in bytes. */
  iconAssetSize?: number;
  bannerAssetUuid?: string;
  bannerMedia?: MediaDescriptor;
  /** Stored file size in bytes. */
  bannerAssetSize?: number;
  descriptionContent?: ContentFieldValue;
  contentSections?: ProjectSectionContentValue[];
  stages?: ProjectStageContentValue[];
  showcaseAssets?: ShowcaseAssetGetItem[];
  otherAssets?: OtherAssetGetItem[];
  relations?: RelationGetItem[];
  externalLinks?: ProjectExternalLink[];
  tags?: TagItem[];
  action?: ProjectActionEditData;
  actionIconMedia?: MediaDescriptor;
  actionIconAssetSize?: number;
  actionBackgroundMedia?: MediaDescriptor;
  actionBackgroundAssetSize?: number;
  actionFileMedia?: MediaDescriptor;
  actionFileExtension?: string;
  actionFileSize?: number;
  actionFaviconMedia?: MediaDescriptor;
  /** The first page of the project's status history, newest first. */
  statuses?: ProfileHistoryPage<StatusHistoryItem>;
  reminder: string;
  notes?: ContentFieldValue;
};

export type { RelationType } from '../relation';

/**
 * Identities the server assigned to freshly created stages and sections.
 *
 * The form knows an item only by its public ID until the first save; without
 * these pairs the next save would offer the same public ID with no uuid
 * attached, and the storage layer would rightly read that as a collision with
 * the row it had just written.
 */
export type ProjectContentItemIdentity = {
  publicId: string;
  itemUuid: string;
};

export type ProjectSaveResponse =
  | {
      type: 'success';
      projectUuid: string;
      action: ProjectActionEditData;
      stages: ProjectContentItemIdentity[];
      sections: ProjectContentItemIdentity[];
    }
  | {
      type: 'error';
      message: string;
      code?: 'public-id-taken';
    };

export type ProjectListItem = {
  projectUuid: string;
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  access: ProjectEventAccessLevel;
  showcase: boolean;
  cv: boolean;
  iconMedia: MediaDescriptor;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
  /** The owner-only reminder, when one is set. */
  reminder?: string;
};

export type ProjectListResponse = AdminPaginatedResponse<ProjectListItem>;
