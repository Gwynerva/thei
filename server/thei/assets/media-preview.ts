import sharp from 'sharp';
import { AssetType } from '#layers/thei/shared/asset';
import {
  extractVideoThumbnail,
  type VideoThumbnailOptions,
} from './video-thumbnail';
import type { AssetBytes } from './bytes';
import { svgDensityFor } from './svg-density';

export const MEDIA_PREVIEW_MAX_LONG_SIDE = 720;
/** On AVIF's own scale, not the displayed 10-100 upload scale. */
export const MEDIA_PREVIEW_QUALITY = 40;
export const MEDIA_PREVIEW_EXTENSION = 'avif';

export interface MediaPreview {
  buffer: Buffer;
  width: number;
  height: number;
  /** Of a video: seconds into it the preview frame was taken from. */
  frameAt?: number;
  /** Of a video: how well that frame shows it (`frameScore`). */
  frameScore?: number;
}

export async function createMediaPreview(
  source: AssetBytes | Buffer,
  sourceType: AssetType.Image | AssetType.Video,
  options: VideoThumbnailOptions = {},
): Promise<MediaPreview> {
  const bytes: AssetBytes = Buffer.isBuffer(source)
    ? { buffer: source }
    : source;
  // sharp accepts a path, so an image preview never reads the source into
  // memory. Only the video path has to go through ffmpeg first, which picks
  // a frame that stands for the video rather than its opening.
  const thumbnail =
    sourceType === AssetType.Video
      ? await extractVideoThumbnail(bytes, options)
      : undefined;
  const raster: Buffer | string = thumbnail
    ? thumbnail.frame
    : (bytes.buffer ?? bytes.path);

  // An SVG is drawn at the preview's own size: at librsvg's default a small
  // drawing would come out as small as its units, and look blurred enlarged.
  const density = thumbnail
    ? undefined
    : await svgDensityFor(raster, MEDIA_PREVIEW_MAX_LONG_SIDE);

  // An original JPEG keeps its EXIF orientation, and its recorded dimensions
  // are already the displayed ones: the preview has to be turned the same way.
  const { data, info } = await sharp(raster, { animated: false, density })
    .autoOrient()
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
    ...(thumbnail
      ? { frameAt: thumbnail.at, frameScore: thumbnail.score }
      : {}),
  };
}
