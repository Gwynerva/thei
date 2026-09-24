import { ASSET_QUALITY_LEVEL_QUALITY } from './asset-quality-levels';
import { fitInside, type AssetImageFormat } from './asset-upload-settings';
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

/**
 * How a field prepares the files put into it.
 *
 * A profile describes the place, not the file: the crop proportions it shows
 * and the largest size worth storing for it. The editor starts from it; what
 * ends up stored is whatever the admin settled on.
 */
export interface AssetUploadProfileConfig {
  /** The largest output worth storing; the crop is fitted inside it. */
  box: FileDimensions;
  /** Crop proportions the place shows. Absent when any shape fits. */
  aspect?: FileDimensions;
  /**
   * How the place frames the file. A circle is only a guide in the editor:
   * the stored file stays rectangular and the place rounds it.
   */
  shape?: 'rect' | 'circle';
  imageQuality: number;
  videoQuality: number;
  stripAudio: boolean;
  /** A fixed output format, for places that must not get another one. */
  imageFormat?: AssetImageFormat;
}

const square = { width: 1, height: 1 };
/** The stored qualities of the levels a place starts from. */
const high = ASSET_QUALITY_LEVEL_QUALITY.high;
const medium = ASSET_QUALITY_LEVEL_QUALITY.medium;

export const ASSET_UPLOAD_PROFILE_CONFIGS = {
  'profile-avatar': {
    box: { width: 256, height: 256 },
    aspect: square,
    shape: 'circle',
    imageQuality: high,
    videoQuality: medium,
    stripAudio: true,
  },
  'profile-banner': {
    box: { width: 1200, height: 400 },
    aspect: { width: 3, height: 1 },
    imageQuality: high,
    videoQuality: medium,
    stripAudio: true,
  },
  'profile-favicon': {
    // The engine derives the whole icon set from this one file, down to 16 px
    // and up to a 180 px touch icon, so it is stored large enough to scale
    // down cleanly rather than at any one display size.
    box: { width: 512, height: 512 },
    aspect: square,
    imageQuality: high,
    videoQuality: medium,
    stripAudio: true,
    // Browsers never see this file: the whole icon set is redrawn from it on
    // the server, so it matters only as a source. At 512 px, lossy
    // compression leaves nothing visible once the icon shrinks to 16–48 px.
    imageFormat: 'webp',
  },
  'profile-status': {
    box: { width: 128, height: 128 },
    aspect: square,
    imageQuality: high,
    videoQuality: medium,
    stripAudio: true,
  },
  'project-icon': {
    box: { width: 256, height: 256 },
    aspect: square,
    imageQuality: high,
    videoQuality: medium,
    stripAudio: true,
  },
  'project-banner': {
    box: { width: 1200, height: 675 },
    aspect: { width: 16, height: 9 },
    imageQuality: high,
    videoQuality: medium,
    stripAudio: true,
  },
  'project-action-icon': {
    box: { width: 48, height: 48 },
    aspect: square,
    imageQuality: high,
    videoQuality: medium,
    stripAudio: true,
  },
  'project-action-background': {
    // The button shows its background at its own size, fitted, covered or
    // tiled, so the file keeps the shape it was drawn in.
    box: { width: 1024, height: 256 },
    imageQuality: high,
    videoQuality: medium,
    stripAudio: true,
  },
  'tag-icon': {
    box: { width: 128, height: 128 },
    aspect: square,
    imageQuality: medium,
    videoQuality: medium,
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
  /** The largest size the place stores, in those proportions. */
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
  const aspect = config?.aspect;
  if (!aspect || aspect.width === aspect.height) return undefined;
  const divisor = greatestCommonDivisor(aspect.width, aspect.height);
  return {
    ratio: `${aspect.width / divisor}:${aspect.height / divisor}`,
    ...fitInside(aspect, config.box, true),
  };
}

function greatestCommonDivisor(left: number, right: number): number {
  return right ? greatestCommonDivisor(right, left % right) : left;
}
