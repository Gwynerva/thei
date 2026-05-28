import type { LanguagePhrases } from './language/types';
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from './asset';

export interface ResizeOptions {
  width: number;
  height: number;
  fit: 'cover' | 'contain' | 'fill' | 'inside';
  /** Do not enlarge if source is smaller than the target dimensions. */
  withoutEnlargement?: boolean;
}

export interface WebpProcessOptions {
  format: 'webp';
  quality: number;
  effort?: number;
  resize?: ResizeOptions;
}

export interface Mp4ProcessOptions {
  format: 'mp4';
  resize?: ResizeOptions;
  /** Strip all audio tracks from the output. */
  muteAudio?: boolean;
}

export type AssetProcessOptions = WebpProcessOptions | Mp4ProcessOptions;

export interface AssetUploadProfile {
  id: string;
  label: string;
  acceptedExtensions: string[] | '*';
  maxSizeBytes: number;
  process: AssetProcessOptions | null;
  hintKey?: keyof LanguagePhrases;
  /** When true, the server extracts a first-frame WebP thumbnail after processing. */
  hasVideoPreview?: boolean;
}

export const ASSET_PROFILES = {
  icon: {
    id: 'icon',
    label: 'Icon',
    acceptedExtensions: [...IMAGE_EXTENSIONS],
    maxSizeBytes: 10 * 1024 * 1024,
    process: {
      format: 'webp',
      quality: 80,
      effort: 6,
      resize: {
        width: 256,
        height: 256,
        fit: 'cover',
        withoutEnlargement: true,
      },
    },
    hintKey: 'asset_profile_hint_icon',
  },
  'icon-original': {
    id: 'icon-original',
    label: 'Icon (original)',
    acceptedExtensions: [...IMAGE_EXTENSIONS],
    maxSizeBytes: 10 * 1024 * 1024,
    process: null,
  },
  raw: {
    id: 'raw',
    label: 'Raw',
    acceptedExtensions: '*' as '*',
    maxSizeBytes: 100 * 1024 * 1024,
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
      resize: {
        width: 1200,
        height: 675,
        fit: 'cover',
        withoutEnlargement: true,
      },
    },
    hintKey: 'asset_profile_hint_banner',
  },
  'banner-original': {
    id: 'banner-original',
    label: 'Banner (original)',
    acceptedExtensions: [...IMAGE_EXTENSIONS],
    maxSizeBytes: 10 * 1024 * 1024,
    process: null,
  },
  'showcase-image-small': {
    id: 'showcase-image-small',
    label: 'Small (640)',
    acceptedExtensions: [...IMAGE_EXTENSIONS],
    maxSizeBytes: 20 * 1024 * 1024,
    process: {
      format: 'webp',
      quality: 85,
      resize: { width: 640, height: 640, fit: 'inside' },
    },
  },
  'showcase-image-normal': {
    id: 'showcase-image-normal',
    label: 'Normal (1280)',
    acceptedExtensions: [...IMAGE_EXTENSIONS],
    maxSizeBytes: 20 * 1024 * 1024,
    process: {
      format: 'webp',
      quality: 85,
      resize: { width: 1280, height: 1280, fit: 'inside' },
    },
  },
  'showcase-image-high': {
    id: 'showcase-image-high',
    label: 'High (1920)',
    acceptedExtensions: [...IMAGE_EXTENSIONS],
    maxSizeBytes: 20 * 1024 * 1024,
    process: {
      format: 'webp',
      quality: 90,
      resize: { width: 1920, height: 1920, fit: 'inside' },
    },
  },
  'showcase-image-as-uploaded': {
    id: 'showcase-image-as-uploaded',
    label: 'As uploaded',
    acceptedExtensions: [...IMAGE_EXTENSIONS],
    maxSizeBytes: 20 * 1024 * 1024,
    process: { format: 'webp', quality: 90 },
  },
  'showcase-video-small': {
    id: 'showcase-video-small',
    label: 'Small (640)',
    acceptedExtensions: [...VIDEO_EXTENSIONS],
    maxSizeBytes: 20 * 1024 * 1024,
    process: {
      format: 'mp4',
      resize: { width: 640, height: 640, fit: 'inside' },
    },
    hasVideoPreview: true,
  },
  'showcase-video-normal': {
    id: 'showcase-video-normal',
    label: 'Normal (1280)',
    acceptedExtensions: [...VIDEO_EXTENSIONS],
    maxSizeBytes: 20 * 1024 * 1024,
    process: {
      format: 'mp4',
      resize: { width: 1280, height: 1280, fit: 'inside' },
    },
    hasVideoPreview: true,
  },
  'showcase-video-high': {
    id: 'showcase-video-high',
    label: 'High (1920)',
    acceptedExtensions: [...VIDEO_EXTENSIONS],
    maxSizeBytes: 20 * 1024 * 1024,
    process: {
      format: 'mp4',
      resize: { width: 1920, height: 1920, fit: 'inside' },
    },
    hasVideoPreview: true,
  },
  'showcase-video-as-uploaded': {
    id: 'showcase-video-as-uploaded',
    label: 'As uploaded',
    acceptedExtensions: [...VIDEO_EXTENSIONS],
    maxSizeBytes: 20 * 1024 * 1024,
    process: { format: 'mp4' },
    hasVideoPreview: true,
  },
  'icon-video': {
    id: 'icon-video',
    label: 'Icon (video)',
    acceptedExtensions: [...VIDEO_EXTENSIONS],
    maxSizeBytes: 10 * 1024 * 1024,
    process: {
      format: 'mp4',
      resize: {
        width: 256,
        height: 256,
        fit: 'cover',
        withoutEnlargement: true,
      },
      muteAudio: true,
    },
    hasVideoPreview: true,
  },
  'icon-video-original': {
    id: 'icon-video-original',
    label: 'Icon (video, original)',
    acceptedExtensions: [...VIDEO_EXTENSIONS],
    maxSizeBytes: 10 * 1024 * 1024,
    process: { format: 'mp4', muteAudio: true },
    hasVideoPreview: true,
  },
  'banner-video': {
    id: 'banner-video',
    label: 'Banner (video)',
    acceptedExtensions: [...VIDEO_EXTENSIONS],
    maxSizeBytes: 10 * 1024 * 1024,
    process: {
      format: 'mp4',
      resize: {
        width: 1200,
        height: 675,
        fit: 'cover',
        withoutEnlargement: true,
      },
      muteAudio: true,
    },
    hasVideoPreview: true,
  },
  'banner-video-original': {
    id: 'banner-video-original',
    label: 'Banner (video, original)',
    acceptedExtensions: [...VIDEO_EXTENSIONS],
    maxSizeBytes: 10 * 1024 * 1024,
    process: { format: 'mp4', muteAudio: true },
    hasVideoPreview: true,
  },
  'other-video-raw': {
    id: 'other-video-raw',
    label: 'Video (as-is)',
    acceptedExtensions: [...VIDEO_EXTENSIONS],
    maxSizeBytes: 100 * 1024 * 1024,
    process: null,
    hasVideoPreview: true,
  },
} as const satisfies Record<string, AssetUploadProfile>;

export type AssetProfileId = keyof typeof ASSET_PROFILES;
