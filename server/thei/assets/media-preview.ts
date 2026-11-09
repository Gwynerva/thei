import sharp from 'sharp';
import { AssetType } from '#layers/thei/shared/asset';
import type { AssetImageTransformSettings } from '#layers/thei/shared/asset-upload-settings';
import type { AssetSourceFile } from './process';
import {
  extractVideoThumbnail,
  type VideoThumbnailOptions,
} from './video-thumbnail';
import type { AssetBytes } from './bytes';
import { renderImagePreview } from './process';
import { svgDensityFor } from './svg-density';
import { withRasterReadySvg } from './svg-raster-input';

export const MEDIA_PREVIEW_MAX_LONG_SIDE = 720;
/** On AVIF's own scale, not the displayed 10-100 upload scale. */
export const MEDIA_PREVIEW_QUALITY = 40;
export const MEDIA_PREVIEW_EXTENSION = 'avif';
/** Half the time of sharp's default 4 at 720 px, for the same bytes (the media bench). */
export const MEDIA_PREVIEW_EFFORT = 3;

/** The source an image transform was made from, to draw its preview from. */
export interface MediaPreviewOrigin {
  source: Pick<AssetSourceFile, 'path' | 'extension'>;
  settings: AssetImageTransformSettings;
}

export interface MediaPreview {
  buffer: Buffer;
  width: number;
  height: number;
  /** Of a video: seconds into it of the preview frame, where a player shows it. */
  frameAt?: number;
  /** Of a video: how well that frame shows it (`frameScore`). */
  frameScore?: number;
}

export async function createMediaPreview(
  source: AssetBytes | Buffer,
  sourceType: AssetType.Image | AssetType.Video,
  options: VideoThumbnailOptions = {},
  origin?: MediaPreviewOrigin,
): Promise<MediaPreview> {
  // A transform's preview is the transform again, at the preview's size,
  // from the source it was made from: the same crop and turn, decoded small.
  if (origin && sourceType === AssetType.Image) {
    const { data, info } = await renderImagePreview(
      origin.source,
      origin.settings,
      MEDIA_PREVIEW_MAX_LONG_SIDE,
      (pipeline) =>
        pipeline.avif({
          quality: MEDIA_PREVIEW_QUALITY,
          effort: MEDIA_PREVIEW_EFFORT,
        }),
    );
    return { buffer: data, width: info.width, height: info.height };
  }
  const bytes: AssetBytes = Buffer.isBuffer(source)
    ? { buffer: source }
    : source;
  // sharp accepts a path, so an image preview never reads the source into
  // memory. Only the video path has to go through ffmpeg first, which picks
  // a frame that stands for the video rather than its opening and writes it
  // no larger than the preview.
  const thumbnail =
    sourceType === AssetType.Video
      ? await extractVideoThumbnail(bytes, {
          ...options,
          maxSide: MEDIA_PREVIEW_MAX_LONG_SIDE,
        })
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
  const draw = (input: Buffer | string) =>
    sharp(input, { animated: false, density, failOn: 'truncated' })
      .autoOrient()
      .resize({
        width: MEDIA_PREVIEW_MAX_LONG_SIDE,
        height: MEDIA_PREVIEW_MAX_LONG_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .avif({ quality: MEDIA_PREVIEW_QUALITY, effort: MEDIA_PREVIEW_EFFORT })
      .toBuffer({ resolveWithObject: true });
  // Only an SVG — what has a density — is prepared for librsvg; a photo or a
  // video's frame is drawn as it is, never scanned for SVG tags.
  const { data, info } =
    density === undefined
      ? await draw(raster)
      : await withRasterReadySvg(raster, draw);

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    ...(thumbnail
      ? { frameAt: thumbnail.at, frameScore: thumbnail.score }
      : {}),
  };
}
