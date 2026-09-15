import sharp from 'sharp';
import { AssetType } from '#layers/thei/shared/asset';
import { extractVideoThumbnail } from './video-thumbnail';
import type { AssetBytes } from './bytes';

export const MEDIA_PREVIEW_MAX_LONG_SIDE = 720;
/** On AVIF's own scale, not the displayed 10-100 upload scale. */
export const MEDIA_PREVIEW_QUALITY = 40;
export const MEDIA_PREVIEW_EXTENSION = 'avif';

export interface MediaPreview {
  buffer: Buffer;
  width: number;
  height: number;
}

export async function createMediaPreview(
  source: AssetBytes | Buffer,
  sourceType: AssetType.Image | AssetType.Video,
): Promise<MediaPreview> {
  const bytes: AssetBytes = Buffer.isBuffer(source)
    ? { buffer: source }
    : source;
  // sharp accepts a path, so an image preview never reads the source into
  // memory. Only the video path has to go through ffmpeg first.
  const raster: Buffer | string =
    sourceType === AssetType.Video
      ? await extractVideoThumbnail(bytes)
      : (bytes.buffer ?? bytes.path);

  const { data, info } = await sharp(raster, { animated: false })
    .resize({
      width: MEDIA_PREVIEW_MAX_LONG_SIDE,
      height: MEDIA_PREVIEW_MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .avif({ quality: MEDIA_PREVIEW_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
  };
}
