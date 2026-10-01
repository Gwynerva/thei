import type { AssetDraftSource } from './api/asset-draft';
import { AssetType } from './asset';
import {
  ASSET_QUALITY_LEVEL_QUALITY,
  DEFAULT_IMAGE_QUALITY_LEVEL,
  DEFAULT_VIDEO_QUALITY_LEVEL,
} from './asset-quality-levels';
import {
  createOriginalAssetSettings,
  type AssetUploadRequest,
} from './asset-upload-settings';

/**
 * Kept as they are: the image pipeline reads one frame with `animated:
 * false`, which would flatten an animation, and rasterises a vector.
 */
const KEPT_AS_IS = new Set(['svg', 'gif']);

/**
 * What a file pasted into the text is stored as, without anyone asking:
 * medium quality, the whole frame at the file's own size, in the format the
 * long-side rule picks. Those are the editor's own defaults, so an encode
 * interrupted to open the editor on the file is the editor's first dry run.
 */
export function pastedMediaRequest(
  draft: Pick<AssetDraftSource, 'type' | 'extension'>,
): AssetUploadRequest {
  const extension = draft.extension.toLowerCase();
  if (draft.type === AssetType.Image && !KEPT_AS_IS.has(extension)) {
    return {
      type: 'image-transform',
      quality: ASSET_QUALITY_LEVEL_QUALITY[DEFAULT_IMAGE_QUALITY_LEVEL],
      dimensions: {},
    };
  }
  if (draft.type === AssetType.Video) {
    return {
      type: 'video-transform',
      quality: ASSET_QUALITY_LEVEL_QUALITY[DEFAULT_VIDEO_QUALITY_LEVEL],
      dimensions: {},
      stripAudio: false,
      fastConversion: false,
    };
  }
  return createOriginalAssetSettings();
}
