import type { ProjectEventAccessLevel } from '../access-level';
import type { AssetType } from '../asset';

export type ProjectSlugCheckResponse = {
  taken: boolean;
};

/** Base display item for any project asset list (showcase, other-assets, …). */
export type AssetListItem = {
  assetUuid: string;
  /** Thumbnail image URL (webp). For images this is the asset itself; for videos it is the first-frame preview. */
  previewUrl: string;
  /** MP4 URL. Present only for video assets. */
  videoUrl?: string;
  /** Stored (processed) file size in bytes. */
  size: number;
};

export type ShowcaseAssetGetItem = AssetListItem & {
  type: AssetType;
  caption?: string;
  access: 'project' | 'private';
};

/** Display item for the "Other files" list. previewUrl is absent for non-image/video files. */
export type OtherAssetGetItem = {
  assetUuid: string;
  /** Thumbnail / image URL. Absent for unknown file types. */
  previewUrl?: string;
  /** MP4 URL. Present only for video assets. */
  videoUrl?: string;
  /** Canonical download URL. Always set — used for the View button. */
  assetUrl: string;
  size: number;
  extension: string;
  title: string;
  caption?: string;
  access: 'project' | 'private';
};

export type ProjectGetResponse = {
  projectUuid: string;
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  important: boolean;
  cv: boolean;
  iconAssetUuid?: string;
  iconPreviewUrl?: string;
  /** MP4 URL. Present only when the icon asset is a video. */
  iconVideoUrl?: string;
  iconDominantHue?: number;
  /** Stored file size in bytes. */
  iconAssetSize?: number;
  bannerAssetUuid?: string;
  bannerPreviewUrl?: string;
  /** MP4 URL. Present only when the banner asset is a video. */
  bannerVideoUrl?: string;
  /** Stored file size in bytes. */
  bannerAssetSize?: number;
  showcaseAssets?: ShowcaseAssetGetItem[];
  otherAssets?: OtherAssetGetItem[];
};

export type ProjectSaveResponse =
  | { type: 'success'; projectUuid: string }
  | { type: 'error'; message: string };

export type ProjectListItem = {
  projectUuid: string;
  title: string;
  summary: string;
  slug: string;
  access: ProjectEventAccessLevel;
  important: boolean;
  cv: boolean;
  iconPreviewUrl?: string;
  iconDominantHue?: number;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
};
