import type { AssetResizeMode } from './asset-upload-settings';
import type { FileDimensions } from './asset-upload-dimensions';

export type AssetUploadProfile = 'project-icon' | 'project-banner';

export interface AssetUploadProfileConfig {
  dimensions: FileDimensions;
  resizeMode: AssetResizeMode;
  allowUpscale: boolean;
  imageQuality: number;
  videoQuality: number;
  stripAudio: boolean;
}

export const ASSET_UPLOAD_PROFILE_CONFIGS = {
  'project-icon': {
    dimensions: { width: 256, height: 256 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 80,
    videoQuality: 70,
    stripAudio: true,
  },
  'project-banner': {
    dimensions: { width: 1200, height: 675 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 80,
    videoQuality: 70,
    stripAudio: true,
  },
} as const satisfies Record<AssetUploadProfile, AssetUploadProfileConfig>;

export function getAssetUploadProfileConfig(
  profile: AssetUploadProfile | undefined,
): AssetUploadProfileConfig | undefined {
  return profile ? ASSET_UPLOAD_PROFILE_CONFIGS[profile] : undefined;
}
