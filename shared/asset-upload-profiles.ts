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
    // The engine derives the whole icon set from this one file, down to 16 px
    // and up to a 180 px touch icon, so it is stored large enough to scale
    // down cleanly rather than at any one display size.
    dimensions: { width: 512, height: 512 },
    resizeMode: 'cover',
    allowUpscale: true,
    imageQuality: 90,
    videoQuality: 85,
    stripAudio: true,
    // Browsers never see this file: the whole icon set is redrawn from it on
    // the server, so it matters only as a source. At 512 px, lossy
    // compression leaves nothing visible once the icon shrinks to 16–48 px.
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

export interface AssetUploadProfileAspect {
  /** Reduced ratio, such as `16:9`. */
  ratio: string;
  width: number;
  height: number;
}

/**
 * The shape a profile crops to, when that shape is not a square.
 *
 * A square is what anyone expects of an icon or an avatar; a banner is not,
 * and knowing its proportions up front saves preparing an image twice.
 */
export function getAssetUploadProfileAspect(
  profile: AssetUploadProfile | undefined,
): AssetUploadProfileAspect | undefined {
  const config = getAssetUploadProfileConfig(profile);
  if (!config || config.resizeMode !== 'cover') return undefined;
  const { width, height } = config.dimensions;
  if (!width || !height || width === height) return undefined;
  const divisor = greatestCommonDivisor(width, height);
  return { ratio: `${width / divisor}:${height / divisor}`, width, height };
}

function greatestCommonDivisor(left: number, right: number): number {
  return right ? greatestCommonDivisor(right, left % right) : left;
}
