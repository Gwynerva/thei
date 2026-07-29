import sharp from 'sharp';
import { AssetType } from '#layers/thei/shared/asset';
import { extractVideoThumbnail } from './video-thumbnail';

export const MEDIA_PREVIEW_MAX_LONG_SIDE = 720;
export const MEDIA_PREVIEW_WEBP_QUALITY = 60;
export const MEDIA_PREVIEW_VERSION = 1;

export interface MediaPreview {
  buffer: Buffer;
  width: number;
  height: number;
}

export async function createMediaPreview(
  sourceBuffer: Buffer,
  sourceType: AssetType.Image | AssetType.Video,
): Promise<MediaPreview> {
  const rasterBuffer =
    sourceType === AssetType.Video
      ? await extractVideoThumbnail(sourceBuffer)
      : sourceBuffer;

  const { data, info } = await sharp(rasterBuffer, { animated: false })
    .resize({
      width: MEDIA_PREVIEW_MAX_LONG_SIDE,
      height: MEDIA_PREVIEW_MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: MEDIA_PREVIEW_WEBP_QUALITY, effort: 6 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
  };
}
