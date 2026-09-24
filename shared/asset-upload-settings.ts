import { AssetType } from './asset';
import {
  centeredCropRect,
  clampCropRect,
  evenCropRect,
  isFullFrameCrop,
  normalizeAssetRotation,
  rotatedDimensions,
  type AssetCropRect,
  type AssetRotation,
} from './asset-crop';
import type { FileDimensions } from './asset-upload-dimensions';

export type { AssetCropRect, AssetRotation } from './asset-crop';

/**
 * Output format for an image transform.
 *
 * A requested parameter, not an engine setting: it belongs in the settings key
 * because two formats are genuinely two different derivations.
 *
 * - `avif` is the default. Measured with these encoder settings on photos,
 *   screenshots and text, it came out smaller than lossy WebP at the same
 *   quality and closer to the source, edges and small text included.
 * - `webp` is what a browser tab icon can rely on, and on tiny flat images it
 *   can undercut AVIF by a few hundred bytes of container.
 * - `webp-lossless` keeps every pixel: the editor's "lossless" stop past the
 *   quality levels. On flat graphics it can undercut the lossy formats, and
 *   "Auto" then picks it; on photographs it is many times larger.
 * - `svg` keeps a vector source a vector: the drawing is only cropped and
 *   given its new size. Offered for SVG sources alone.
 */
export type AssetImageFormat = 'avif' | 'webp' | 'webp-lossless' | 'svg';

export const ASSET_IMAGE_FORMATS: readonly AssetImageFormat[] = [
  'avif',
  'webp',
  'webp-lossless',
  'svg',
];

export const DEFAULT_ASSET_IMAGE_FORMAT: AssetImageFormat = 'avif';

/**
 * Long side below which WebP still beats AVIF.
 *
 * AVIF's container overhead does not amortize on a small icon. Measured on
 * this project's own media, AVIF is 1.0-1.3x the size of WebP at 48px and only
 * pulls ahead from roughly 128px, where it reaches 0.6x and then 0.24-0.33x at
 * banner sizes. Choosing by size keeps every asset on whichever encoder is
 * actually smaller for it.
 */
export const ASSET_IMAGE_AVIF_MIN_LONG_SIDE = 128;

/** Largest side any transform may produce. */
export const ASSET_TRANSFORM_MAX_DIMENSION = 8192;

/**
 * Picks the output format for an image transform.
 *
 * An explicit request always wins; otherwise the long side of the output
 * decides.
 */
export function resolveAssetImageFormat(
  dimensions: FileDimensions,
  requested?: AssetImageFormat,
): AssetImageFormat {
  if (requested) return normalizeAssetImageFormat(requested);
  const longSide = Math.max(dimensions.width, dimensions.height);
  return longSide < ASSET_IMAGE_AVIF_MIN_LONG_SIDE
    ? 'webp'
    : DEFAULT_ASSET_IMAGE_FORMAT;
}

export interface AssetUploadDimensions {
  width?: number;
  height?: number;
}

/**
 * Where a transform takes its pixels from and what size it writes.
 *
 * Together these describe the geometry completely: the source is turned by
 * `rotation` (not at all when absent), the crop picks a region of the turned
 * frame (all of it when absent), and the output is exactly `dimensions`.
 * That size has the crop's proportions unless `stretch` says the admin
 * unlinked the sides. There is no fit mode to choose, and nothing is ever
 * enlarged except a vector source.
 */
export interface AssetTransformGeometry {
  rotation?: Exclude<AssetRotation, 0>;
  crop?: AssetCropRect;
  dimensions: FileDimensions;
  /** The output is not in the crop's proportions: the picture is stretched. */
  stretch?: true;
}

export interface AssetOriginalSettings {
  type: 'original';
}

export interface AssetImageTransformSettings extends AssetTransformGeometry {
  type: 'image-transform';
  quality: number;
  format: AssetImageFormat;
}

export interface AssetVideoTransformSettings extends AssetTransformGeometry {
  type: 'video-transform';
  quality: number;
  stripAudio: boolean;
  fastConversion: boolean;
}

export interface AssetFileZipSettings {
  type: 'file-zip';
}

export type AssetTransformSettings =
  AssetImageTransformSettings | AssetVideoTransformSettings;

export type AssetUploadSettings =
  AssetOriginalSettings | AssetTransformSettings | AssetFileZipSettings;

export type AssetSettingsForType<TType extends AssetType> =
  TType extends AssetType.Image
    ? AssetOriginalSettings | AssetImageTransformSettings
    : TType extends AssetType.Video
      ? AssetOriginalSettings | AssetVideoTransformSettings
      : AssetOriginalSettings | AssetFileZipSettings;

/**
 * Fields an admin page built before crops existed still sends while an update
 * swaps the new build in. Accepted on the way in, never stored.
 */
export interface LegacyAssetResizeFields {
  resizeMode?: 'inside' | 'cover';
  allowUpscale?: boolean;
}

/**
 * What a caller asks for, before it is checked against the source.
 *
 * A request may leave a side of the output out; it is then derived from the
 * crop. The server resolves it against the probed source, so the stored
 * recipe is always complete and canonical.
 */
export interface AssetTransformRequestGeometry extends LegacyAssetResizeFields {
  rotation?: AssetRotation;
  crop?: AssetCropRect;
  dimensions: AssetUploadDimensions;
  /**
   * Take both sides exactly, whatever the crop's proportions. Without it two
   * sides are a box the crop is fitted into.
   */
  stretch?: boolean;
}

export interface AssetImageTransformRequest extends AssetTransformRequestGeometry {
  type: 'image-transform';
  quality: number;
  format?: AssetImageFormat;
}

export interface AssetVideoTransformRequest extends AssetTransformRequestGeometry {
  type: 'video-transform';
  quality: number;
  stripAudio: boolean;
  fastConversion: boolean;
}

export type AssetTransformRequest =
  AssetImageTransformRequest | AssetVideoTransformRequest;

export type AssetUploadRequest =
  AssetOriginalSettings | AssetTransformRequest | AssetFileZipSettings;

/** What a transform needs to know about its source. */
export interface AssetTransformSource extends FileDimensions {
  /** Vector sources are redrawn at any size, so they may be enlarged. */
  isVector?: boolean;
  /** `false` only when the source is known to be silent. */
  hasAudio?: boolean;
  /** Seconds of video: what a size estimate multiplies the bitrate by. */
  duration?: number;
  fps?: number;
  /** Bits per second of the video stream: the most a re-encode is worth. */
  bitrate?: number;
  /** The video codec, as ffmpeg names it. */
  codec?: string;
}

export class AssetSettingsError extends Error {
  readonly statusCode = 400;
}

export function normalizeAssetUploadDimensions(
  dimensions: AssetUploadDimensions,
): AssetUploadDimensions {
  return {
    ...(dimensions.width && dimensions.width > 0
      ? { width: Math.round(dimensions.width) }
      : {}),
    ...(dimensions.height && dimensions.height > 0
      ? { height: Math.round(dimensions.height) }
      : {}),
  };
}

export function normalizeAssetUploadQuality(quality: number): number {
  return Math.max(10, Math.min(100, Math.round(quality)));
}

export function normalizeAssetImageFormat(
  format: AssetImageFormat | undefined,
): AssetImageFormat {
  return format && ASSET_IMAGE_FORMATS.includes(format)
    ? format
    : DEFAULT_ASSET_IMAGE_FORMAT;
}

/** The file extension an image format is stored under. */
export function assetImageFormatExtension(format: AssetImageFormat): string {
  return format === 'avif' ? 'avif' : format === 'svg' ? 'svg' : 'webp';
}

/** Formats with no quality to choose: every pixel, or the vector, is kept. */
export function isLosslessAssetImageFormat(format: AssetImageFormat): boolean {
  return format === 'webp-lossless' || format === 'svg';
}

/** The formats an image can be written in: SVG only from a vector source. */
export function assetImageFormatsFor(isVector: boolean): AssetImageFormat[] {
  return ASSET_IMAGE_FORMATS.filter((format) => isVector || format !== 'svg');
}

export function createOriginalAssetSettings(): AssetOriginalSettings {
  return {
    type: 'original',
  };
}

export function createFileZipSettings(): AssetFileZipSettings {
  return {
    type: 'file-zip',
  };
}

/**
 * Turns a request into the recipe that will be stored.
 *
 * Client and server run the same code: the editor to know the settings key of
 * what it is about to ask for, the server to make sure a request describes
 * exactly one output. A resolved recipe resolves to itself.
 */
export function resolveAssetUploadSettings(
  request: AssetUploadRequest,
  source?: AssetTransformSource,
): AssetUploadSettings {
  if (request.type === 'original') return createOriginalAssetSettings();
  if (request.type === 'file-zip') return createFileZipSettings();
  if (!source?.width || !source.height) {
    throw new AssetSettingsError('Source dimensions are unknown');
  }

  const isVideo = request.type === 'video-transform';
  const geometry = resolveTransformGeometry(request, source, isVideo);

  if (request.type === 'image-transform') {
    const format = resolveAssetImageFormat(geometry.dimensions, request.format);
    if (format === 'svg' && !source.isVector) {
      throw new AssetSettingsError('Only a vector source can stay an SVG');
    }
    return {
      type: 'image-transform',
      // Lossless has no quality to choose: whatever was asked for, the output
      // is the same, so it is recorded as one value and keeps one key.
      quality: isLosslessAssetImageFormat(format)
        ? 100
        : normalizeAssetUploadQuality(request.quality),
      ...geometry,
      format,
    };
  }

  return {
    type: 'video-transform',
    quality: normalizeAssetUploadQuality(request.quality),
    ...geometry,
    // Removing audio from a silent source changes nothing, so the request is
    // described as keeping it: both spellings must map to one settings key.
    stripAudio: Boolean(request.stripAudio) && source.hasAudio !== false,
    fastConversion: Boolean(request.fastConversion),
  };
}

function resolveTransformGeometry(
  request: AssetTransformRequestGeometry,
  source: AssetTransformSource,
  isVideo: boolean,
): AssetTransformGeometry {
  const requested = normalizeAssetUploadDimensions(request.dimensions);
  const rotation = normalizeAssetRotation(request.rotation);
  // Everything after the turn is measured in the turned frame.
  const frame = rotatedDimensions(source, rotation);
  let crop = request.crop
    ? clampCropRect(request.crop, frame)
    : request.resizeMode === 'cover' && requested.width && requested.height
      ? centeredCropRect(frame, requested.width / requested.height)
      : undefined;
  if (crop && isVideo) crop = evenCropRect(crop, frame);
  if (crop && isFullFrameCrop(crop, frame)) crop = undefined;

  const region = crop ?? frame;
  const exact =
    request.stretch && requested.width && requested.height
      ? { width: requested.width, height: requested.height }
      : undefined;
  let dimensions = exact
    ? stretchedDimensions(exact, region, source.isVector)
    : outputDimensions(region, requested, source.isVector);

  if (!exact) {
    // Nothing is ever enlarged: a small source is stored at its own size and
    // the place that shows it scales it. A vector has no size of its own to
    // lose. Both only ever step in when a side is over its limit: fitting a
    // size that already fits would round it again and drift away from the
    // stored recipe.
    if (
      !source.isVector &&
      (dimensions.width > region.width || dimensions.height > region.height)
    ) {
      dimensions = { width: region.width, height: region.height };
    }
    if (
      dimensions.width > ASSET_TRANSFORM_MAX_DIMENSION ||
      dimensions.height > ASSET_TRANSFORM_MAX_DIMENSION
    ) {
      dimensions = fitInside(dimensions, {
        width: ASSET_TRANSFORM_MAX_DIMENSION,
        height: ASSET_TRANSFORM_MAX_DIMENSION,
      });
    }
  }
  if (isVideo) {
    dimensions = {
      width: Math.max(2, dimensions.width - (dimensions.width % 2)),
      height: Math.max(2, dimensions.height - (dimensions.height % 2)),
    };
  }
  // Unlinked sides that land on the crop's proportions stretch nothing, and
  // are described the same as linked ones.
  const stretch = Boolean(exact) && !matchesAspect(dimensions, region);

  return {
    ...(rotation ? { rotation } : {}),
    ...(crop ? { crop } : {}),
    dimensions,
    ...(stretch ? { stretch: true as const } : {}),
  };
}

/**
 * Unlinked sides, each kept to the crop's own side so nothing is enlarged —
 * a vector aside — and to the largest side a transform may write.
 */
function stretchedDimensions(
  exact: FileDimensions,
  region: FileDimensions,
  isVector = false,
): FileDimensions {
  const side = (value: number, own: number) =>
    Math.max(
      1,
      Math.min(
        value,
        isVector ? ASSET_TRANSFORM_MAX_DIMENSION : own,
        ASSET_TRANSFORM_MAX_DIMENSION,
      ),
    );
  return {
    width: side(exact.width, region.width),
    height: side(exact.height, region.height),
  };
}

/**
 * The output size for a region.
 *
 * Both sides given and already in the region's proportions (to the pixel)
 * are taken as they are, which keeps a resolved recipe stable. Otherwise the
 * sides are a box the region is fitted into, and a missing side follows the
 * region.
 */
function outputDimensions(
  region: FileDimensions,
  requested: AssetUploadDimensions,
  enlarge = false,
): FileDimensions {
  const { width, height } = requested;
  if (width && height) {
    return matchesAspect({ width, height }, region)
      ? { width, height }
      : fitInside(region, { width, height }, enlarge);
  }
  if (width) {
    return {
      width,
      height: Math.max(1, Math.round((width * region.height) / region.width)),
    };
  }
  if (height) {
    return {
      width: Math.max(1, Math.round((height * region.width) / region.height)),
      height,
    };
  }
  return { width: region.width, height: region.height };
}

/** Whether a size is the region's proportions, allowing for rounding. */
function matchesAspect(size: FileDimensions, region: FileDimensions): boolean {
  return (
    Math.abs(size.width - (size.height * region.width) / region.height) <= 1 &&
    Math.abs(size.height - (size.width * region.height) / region.width) <= 1
  );
}

/**
 * The largest size in the region's proportions that fits in the box, never
 * bigger than the region itself unless `enlarge` is set.
 */
export function fitInside(
  region: FileDimensions,
  box: FileDimensions,
  enlarge = false,
): FileDimensions {
  if (!enlarge && region.width <= box.width && region.height <= box.height) {
    return { width: region.width, height: region.height };
  }
  const scale = Math.min(box.width / region.width, box.height / region.height);
  return {
    width: Math.max(1, Math.min(box.width, Math.round(region.width * scale))),
    height: Math.max(
      1,
      Math.min(box.height, Math.round(region.height * scale)),
    ),
  };
}

/**
 * Stable description of the parameters that produced a stored file.
 *
 * It carries only what the caller asked for. Anything describing the engine's
 * own generation — an encoder version, a settings schema version — belongs in
 * `contentHash`, which already changes whenever the output bytes change. A
 * generation counter here would split byte-identical outputs into duplicate
 * rows that nothing ever reconciles.
 *
 * Only resolved settings have a key: a request is resolved first, so two
 * spellings of one output never end up with two keys.
 */
export function buildAssetSettingsKey(settings: AssetUploadSettings): string {
  if (settings.type === 'original') {
    return 'original';
  }

  if (settings.type === 'file-zip') {
    return 'file-zip';
  }

  const { rotation, crop, dimensions } = settings;
  const baseParts = [
    settings.type,
    `q${settings.quality}`,
    `w${dimensions.width}`,
    `h${dimensions.height}`,
    ...(rotation ? [`rot:${rotation}`] : []),
    ...(crop
      ? [`crop:${crop.left},${crop.top},${crop.width},${crop.height}`]
      : []),
  ];

  if (settings.type === 'video-transform') {
    return [
      ...baseParts,
      `strip:${settings.stripAudio ? 1 : 0}`,
      `fast:${settings.fastConversion ? 1 : 0}`,
    ].join(':');
  }

  return [...baseParts, `fmt:${settings.format}`].join(':');
}

export function isAssetTransformSettings(
  settings: AssetUploadSettings | null | undefined,
): settings is AssetTransformSettings {
  return (
    settings?.type === 'image-transform' || settings?.type === 'video-transform'
  );
}
