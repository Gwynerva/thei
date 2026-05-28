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

export const ASSET_CONTAINER_TYPES = ['project', 'event'] as const;
export type AssetContainerType = (typeof ASSET_CONTAINER_TYPES)[number];

export const ASSET_ROLES = [
  'icon',
  'banner',
  'gallery',
  'content',
  'showcase-asset',
  'showcase-preview',
  'other-asset',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export interface ImageAssetMeta {
  /** Pixel width after transformation. Present for all newly uploaded raster images and SVGs. */
  width?: number;
  /** Pixel height after transformation. Present for all newly uploaded raster images and SVGs. */
  height?: number;
  /** OKLCH hue (0–359) of the dominant color. Only set for colorful raster images. */
  dominantHue?: number;
  /** UUID of the first-frame thumbnail asset. Set only for processed video assets. */
  previewAssetUuid?: string;
}

export type AssetMeta = ImageAssetMeta;

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

/** Discriminated union of per-role usage metadata stored in asset_usages.meta. */
export type AssetUsageMeta = ShowcaseAssetUsageMeta | OtherAssetUsageMeta;
