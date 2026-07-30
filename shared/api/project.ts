import type { ProjectEventAccessLevel } from '../access-level';
import type { ArchivedOriginalFileMeta, AssetType } from '../asset';
import type { ContentFieldValue } from '../content';
import type { ProjectContentSectionValue } from '../project-content-section';
import type {
  ProjectRelationEditItem,
  ProjectRelationType,
} from '../admin/project';
import type { MediaDescriptor } from '../media';
import type { TagItem } from '../tag';

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
  iconMedia: MediaDescriptor;
  /** Stored file size in bytes. */
  iconAssetSize?: number;
  bannerAssetUuid?: string;
  bannerMedia?: MediaDescriptor;
  /** Stored file size in bytes. */
  bannerAssetSize?: number;
  descriptionContent?: ContentFieldValue;
  contentSections?: ProjectContentSectionValue[];
  showcaseAssets?: ShowcaseAssetGetItem[];
  otherAssets?: OtherAssetGetItem[];
  relations?: ProjectRelationGetItem[];
  tags?: TagItem[];
};

export type ProjectRelationGetItem = ProjectRelationEditItem & {
  title: string;
  humanReadableSlug: string;
  publicId: string;
  iconMedia: MediaDescriptor;
};

export type ProjectSearchItem = {
  projectUuid: string;
  title: string;
  humanReadableSlug: string;
  publicId: string;
  iconMedia: MediaDescriptor;
  tags?: TagItem[];
};

export type { ProjectRelationType };

export type ProjectSaveResponse =
  | { type: 'success'; projectUuid: string }
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
};
