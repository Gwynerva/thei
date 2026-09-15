import type {
  AssetImageFormat,
  AssetResizeMode,
} from './asset-upload-settings';
import type { FileDimensions } from './asset-upload-dimensions';

export type AssetUploadProfile =
  | 'profile-avatar'
  | 'profile-banner'
  | 'profile-favicon'
  | 'profile-status'
  | 'project-icon'
  | 'project-banner'
  | 'project-action-icon'
  | 'project-action-background'
  | 'tag-icon';

export interface AssetUploadProfileConfig {
  dimensions: FileDimensions;
  resizeMode: AssetResizeMode;
  allowUpscale: boolean;
  imageQuality: number;
  videoQuality: number;
  stripAudio: boolean;
  /** Defaults to AVIF. Set only where AVIF is not reliably consumed. */
  imageFormat?: AssetImageFormat;
}

export const ASSET_UPLOAD_PROFILE_CONFIGS = {
  'profile-avatar': {
    dimensions: { width: 256, height: 256 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 90,
    videoQuality: 85,
    stripAudio: true,
  },
  'profile-banner': {
    dimensions: { width: 1200, height: 400 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 90,
    videoQuality: 85,
    stripAudio: true,
  },
  'profile-favicon': {
    dimensions: { width: 128, height: 128 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 90,
    videoQuality: 85,
    stripAudio: true,
    // This asset ends up in `<link rel="icon">`. Browser support for AVIF in a
    // tab icon is uneven, and failing there shows an empty tab rather than a
    // slightly larger file, so the favicon stays on WebP deliberately.
    imageFormat: 'webp',
  },
  'profile-status': {
    dimensions: { width: 128, height: 128 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 90,
    videoQuality: 85,
    stripAudio: true,
  },
  'project-icon': {
    dimensions: { width: 256, height: 256 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 90,
    videoQuality: 85,
    stripAudio: true,
  },
  'project-banner': {
    dimensions: { width: 1200, height: 675 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 90,
    videoQuality: 85,
    stripAudio: true,
  },
  'project-action-icon': {
    dimensions: { width: 48, height: 48 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 90,
    videoQuality: 85,
    stripAudio: true,
  },
  'project-action-background': {
    dimensions: { width: 128, height: 48 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 90,
    videoQuality: 85,
    stripAudio: true,
  },
  'tag-icon': {
    dimensions: { width: 128, height: 128 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 80,
    videoQuality: 80,
    stripAudio: true,
  },
} as const satisfies Record<AssetUploadProfile, AssetUploadProfileConfig>;

export function getAssetUploadProfileConfig(
  profile: AssetUploadProfile | undefined,
): AssetUploadProfileConfig | undefined {
  return profile ? ASSET_UPLOAD_PROFILE_CONFIGS[profile] : undefined;
}
