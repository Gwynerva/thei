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

export const ASSET_ROLES = ['icon', 'banner', 'gallery', 'content'] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export interface ImageAssetMeta {
  /** Pixel width after transformation. Present for all newly uploaded raster images and SVGs. */
  width?: number;
  /** Pixel height after transformation. Present for all newly uploaded raster images and SVGs. */
  height?: number;
  /** OKLCH hue (0–359) of the dominant color. Only set for colorful raster images. */
  dominantHue?: number;
}

export type AssetMeta = ImageAssetMeta;
