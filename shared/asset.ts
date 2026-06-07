export enum AssetType {
  Image = 'image',
  Video = 'video',
  Audio = 'audio',
  Other = 'other',
}

export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'] as const;
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac'] as const;

export const ASSET_CONTAINER_TYPES = ['project', 'event', 'asset'] as const;
export type AssetContainerType = (typeof ASSET_CONTAINER_TYPES)[number];

export const ASSET_ROLES = [
  'icon',
  'banner',
  'gallery',
  'content',
  'showcase-asset',
  'other-asset',
  'preview',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export interface AssetMetaBase {
  /** Extension point for future computed asset properties. */
  properties?: Record<string, unknown>;
}

export interface ImageAssetMeta extends AssetMetaBase {
  /** Pixel width after upload/transformation when the file has intrinsic dimensions. */
  width?: number;
  /** Pixel height after upload/transformation when the file has intrinsic dimensions. */
  height?: number;
  /** OKLCH hue (0-359) of the dominant color. */
  dominantHue?: number;
}

export interface VideoAssetMeta extends AssetMetaBase {
  /** Pixel width after upload/transformation when available. */
  width?: number;
  /** Pixel height after upload/transformation when available. */
  height?: number;
  /** OKLCH hue (0-359) of the generated first-frame preview. */
  dominantHue?: number;
  /** Whether the stored video keeps or strips audio. */
  audio?: 'keep' | 'strip' | 'none' | 'unknown';
}

export interface AudioAssetMeta extends AssetMetaBase {}

export interface ArchivedOriginalFileMeta {
  extension: string;
  size: number;
  name?: string;
}

export interface OtherAssetMeta extends AssetMetaBase {
  archivedOriginal?: ArchivedOriginalFileMeta;
}

export type AssetMeta =
  | ImageAssetMeta
  | VideoAssetMeta
  | AudioAssetMeta
  | OtherAssetMeta;

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
  access: 'project' | 'private';
}

export interface OtherAssetUsageMeta {
  role: 'other-asset';
  /** Sort order within the other-files list (lower = earlier). */
  order: number;
  title?: string;
  caption?: string;
  access: 'project' | 'private';
}

export interface PreviewAssetUsageMeta {
  role: 'preview';
}

/** Discriminated union of per-role usage metadata stored in asset_usages.meta. */
export type AssetUsageMeta =
  | ShowcaseAssetUsageMeta
  | OtherAssetUsageMeta
  | PreviewAssetUsageMeta;
