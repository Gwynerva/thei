import type { ImageAccent } from '#layers/thei/shared/accent-color';
export enum AssetType {
  Image = 'image',
  Video = 'video',
  Audio = 'audio',
  Other = 'other',
}

export {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from './assets/formats';

export const ASSET_CONTAINER_TYPES = [
  'profile',
  'profile-avatar',
  'profile-status',
  'project',
  'event',
  'page',
  'asset',
  'content',
  'tag',
] as const;
export type AssetContainerType = (typeof ASSET_CONTAINER_TYPES)[number];

export const ASSET_ROLES = [
  'favicon',
  'icon',
  'banner',
  'content',
  'showcase-asset',
  'other-asset',
  'preview',
  'action-icon',
  'action-background',
  'action-file',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

/**
 * Nothing describing the uploaded file itself belongs here: neither its name
 * nor any of its embedded metadata is kept.
 */
export interface AssetMetaBase {
  /** Extension point for future computed asset properties. */
  properties?: Record<string, unknown>;
}

export interface ImageAssetMeta extends AssetMetaBase {
  /** Pixel width after upload/transformation when the file has intrinsic dimensions. */
  width?: number;
  /** Pixel height after upload/transformation when the file has intrinsic dimensions. */
  height?: number;
  /** Representative OKLCH hue and chroma, including neutral images. */
  accent?: ImageAccent;
}

export interface VideoAssetMeta extends AssetMetaBase {
  /** Pixel width after upload/transformation when available. */
  width?: number;
  /** Pixel height after upload/transformation when available. */
  height?: number;
  /** Representative OKLCH color of the first-frame preview. */
  accent?: ImageAccent;
  /** Whether the stored file has an audio track; absent while unknown. */
  hasAudio?: boolean;
}

export interface AudioAssetMeta extends AssetMetaBase {}

export interface ArchivedOriginalFileMeta {
  extension: string;
  size: number;
}

export interface OtherAssetMeta extends AssetMetaBase {
  archivedOriginal?: ArchivedOriginalFileMeta;
}

export type AssetMeta =
  ImageAssetMeta | VideoAssetMeta | AudioAssetMeta | OtherAssetMeta;

export type AssetMetaForType<TType extends AssetType> =
  TType extends AssetType.Image
    ? ImageAssetMeta
    : TType extends AssetType.Video
      ? VideoAssetMeta
      : TType extends AssetType.Audio
        ? AudioAssetMeta
        : OtherAssetMeta;

export interface ShowcaseAssetUsageMeta {
  role: 'showcase-asset';
  /** Sort order within the project showcase (lower = earlier). */
  order: number;
  caption?: string;
  isPrivate: boolean;
}

export interface OtherAssetUsageMeta {
  role: 'other-asset';
  /** Sort order within the other-files list (lower = earlier). */
  order: number;
  title?: string;
  caption?: string;
  isPrivate: boolean;
}

export interface PreviewAssetUsageMeta {
  role: 'preview';
}

export interface ProjectActionAssetUsageMeta {
  role: 'action-icon' | 'action-background' | 'action-file';
  isPrivate: boolean;
}

export interface ContentAssetUsageMeta {
  role: 'content';
  refs: {
    blockId?: string;
    blockType: string;
    isPrivate: boolean;
  }[];
  /** Conservative aggregate: true when any reference is private. */
  isPrivate: boolean;
}

/** Discriminated union of per-role usage metadata stored in asset_usages.meta. */
export type AssetUsageMeta =
  | ShowcaseAssetUsageMeta
  | OtherAssetUsageMeta
  | PreviewAssetUsageMeta
  | ProjectActionAssetUsageMeta
  | ContentAssetUsageMeta;
