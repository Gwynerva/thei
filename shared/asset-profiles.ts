import type { LanguagePhrases } from './language/types';
import { IMAGE_EXTENSIONS } from './asset';

export interface ResizeOptions {
  width: number;
  height: number;
  fit: 'cover' | 'contain' | 'fill';
}

export interface WebpProcessOptions {
  format: 'webp';
  quality: number;
  effort?: number;
  resize?: ResizeOptions;
}

export interface Mp4ProcessOptions {
  format: 'mp4';
  // video-specific options will be added here
}

export type AssetProcessOptions = WebpProcessOptions | Mp4ProcessOptions;

export interface AssetUploadProfile {
  id: string;
  label: string;
  acceptedExtensions: string[] | '*';
  maxSizeBytes: number;
  process: AssetProcessOptions | null;
  hintKey?: keyof LanguagePhrases;
}

export const ASSET_PROFILES = {
  icon: {
    id: 'icon',
    label: 'Icon',
    acceptedExtensions: [...IMAGE_EXTENSIONS],
    maxSizeBytes: 5 * 1024 * 1024,
    process: {
      format: 'webp',
      quality: 80,
      effort: 6,
      resize: { width: 256, height: 256, fit: 'cover' },
    },
    hintKey: 'asset_profile_hint_icon',
  },
  raw: {
    id: 'raw',
    label: 'Raw',
    acceptedExtensions: '*' as '*',
    maxSizeBytes: 50 * 1024 * 1024,
    process: null,
  },
  banner: {
    id: 'banner',
    label: 'Banner',
    acceptedExtensions: [...IMAGE_EXTENSIONS],
    maxSizeBytes: 10 * 1024 * 1024,
    process: {
      format: 'webp',
      quality: 85,
      resize: { width: 1200, height: 675, fit: 'cover' },
    },
    hintKey: 'asset_profile_hint_banner',
  },
} as const satisfies Record<string, AssetUploadProfile>;

export type AssetProfileId = keyof typeof ASSET_PROFILES;
