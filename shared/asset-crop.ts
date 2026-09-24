import type { FileDimensions } from './asset-upload-dimensions';

/**
 * A region of a source, in its pixels as displayed.
 *
 * "As displayed" matters for photos: the EXIF orientation is applied first, so
 * `left`/`top` point at the same place the editor showed.
 */
export interface AssetCropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A crop as fractions of the source, each 0..1.
 *
 * The editor keeps the crop in this form, so it survives switching to another
 * processing source of the same picture at a different size.
 */
export interface AssetCropFraction {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Clockwise quarter turns applied to a source before it is cropped.
 *
 * A crop is always given in the turned frame: the one the editor shows.
 */
export type AssetRotation = 0 | 90 | 180 | 270;

export function normalizeAssetRotation(value: unknown): AssetRotation {
  return value === 90 || value === 180 || value === 270 ? value : 0;
}

/** The frame a source shows once turned. */
export function rotatedDimensions(
  size: FileDimensions,
  rotation: AssetRotation = 0,
): FileDimensions {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/** The same region of a picture after the picture turns a quarter clockwise. */
export function rotateCropFraction(
  fraction: AssetCropFraction,
): AssetCropFraction {
  return {
    left: 1 - fraction.top - fraction.height,
    top: fraction.left,
    width: fraction.height,
    height: fraction.width,
  };
}

export const FULL_CROP_FRACTION: AssetCropFraction = {
  left: 0,
  top: 0,
  width: 1,
  height: 1,
};

/** Keeps a crop inside the source, in whole pixels, at least one pixel big. */
export function clampCropRect(
  crop: AssetCropRect,
  source: FileDimensions,
): AssetCropRect {
  const left = clamp(Math.round(crop.left), 0, source.width - 1);
  const top = clamp(Math.round(crop.top), 0, source.height - 1);
  return {
    left,
    top,
    width: clamp(Math.round(crop.width), 1, source.width - left),
    height: clamp(Math.round(crop.height), 1, source.height - top),
  };
}

/** Video frames are chroma-subsampled: every edge must land on an even pixel. */
export function evenCropRect(
  crop: AssetCropRect,
  source: FileDimensions,
): AssetCropRect {
  const left = crop.left - (crop.left % 2);
  const top = crop.top - (crop.top % 2);
  const width = Math.max(2, Math.min(crop.width, source.width - left));
  const height = Math.max(2, Math.min(crop.height, source.height - top));
  return {
    left,
    top,
    width: width - (width % 2),
    height: height - (height % 2),
  };
}

export function isFullFrameCrop(
  crop: AssetCropRect,
  source: FileDimensions,
): boolean {
  return (
    crop.left === 0 &&
    crop.top === 0 &&
    crop.width === source.width &&
    crop.height === source.height
  );
}

/** The largest region of the given aspect, centred in the source. */
export function centeredCropRect(
  source: FileDimensions,
  aspect: number,
): AssetCropRect {
  const fraction = centeredCropFraction(source, aspect);
  return cropFractionToRect(fraction, source);
}

export function centeredCropFraction(
  source: FileDimensions,
  aspect: number,
): AssetCropFraction {
  const sourceAspect = source.width / source.height;
  if (!Number.isFinite(aspect) || aspect <= 0) return FULL_CROP_FRACTION;
  if (sourceAspect > aspect) {
    const width = aspect / sourceAspect;
    return { left: (1 - width) / 2, top: 0, width, height: 1 };
  }
  const height = sourceAspect / aspect;
  return { left: 0, top: (1 - height) / 2, width: 1, height };
}

export function cropFractionToRect(
  fraction: AssetCropFraction,
  source: FileDimensions,
): AssetCropRect {
  const left = Math.round(fraction.left * source.width);
  const top = Math.round(fraction.top * source.height);
  // Edges are rounded rather than sizes, so a crop touching the far side of
  // the source still touches it after rounding.
  const right = Math.round((fraction.left + fraction.width) * source.width);
  const bottom = Math.round((fraction.top + fraction.height) * source.height);
  return clampCropRect(
    { left, top, width: right - left, height: bottom - top },
    source,
  );
}

export function cropRectToFraction(
  crop: AssetCropRect,
  source: FileDimensions,
): AssetCropFraction {
  return {
    left: crop.left / source.width,
    top: crop.top / source.height,
    width: crop.width / source.width,
    height: crop.height / source.height,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A handle of the crop frame: an edge or a corner, by compass direction. */
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const CROP_CORNER_HANDLES: readonly CropHandle[] = [
  'nw',
  'ne',
  'sw',
  'se',
];
export const CROP_EDGE_HANDLES: readonly CropHandle[] = ['n', 'e', 's', 'w'];

/** Smallest side a crop may be dragged down to, in source pixels. */
const MIN_CROP_SIDE = 16;

/** A crop in source pixels, before rounding: what a drag works with. */
export type CropRectF = AssetCropRect;

export function moveCropRect(
  start: CropRectF,
  dx: number,
  dy: number,
  bounds: FileDimensions,
): CropRectF {
  return {
    ...start,
    left: clamp(start.left + dx, 0, bounds.width - start.width),
    top: clamp(start.top + dy, 0, bounds.height - start.height),
  };
}

/**
 * Resizes a crop by dragging one handle, the opposite side staying put.
 *
 * With a fixed aspect only corners are offered, and whichever axis the drag
 * moved more decides the size. The crop never leaves the source and never
 * shrinks below a few pixels.
 */
export function resizeCropRect(
  start: CropRectF,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: FileDimensions,
  aspect?: number,
): CropRectF {
  const east = handle.includes('e');
  const west = handle.includes('w');
  const north = handle.includes('n');
  const south = handle.includes('s');
  const anchorX = west ? start.left + start.width : start.left;
  const anchorY = north ? start.top + start.height : start.top;
  const maxWidth = west ? anchorX : bounds.width - anchorX;
  const maxHeight = north ? anchorY : bounds.height - anchorY;
  const minSide = Math.min(MIN_CROP_SIDE, bounds.width, bounds.height);

  let width = east ? start.width + dx : west ? start.width - dx : start.width;
  let height = south
    ? start.height + dy
    : north
      ? start.height - dy
      : start.height;

  if (aspect && (east || west) && (north || south)) {
    const byWidth = Math.abs(width / start.width - 1);
    const byHeight = Math.abs(height / start.height - 1);
    width = byWidth >= byHeight ? width : height * aspect;
    const minWidth = Math.max(minSide, minSide * aspect);
    width = clamp(width, minWidth, Math.min(maxWidth, maxHeight * aspect));
    height = width / aspect;
  } else {
    width = clamp(width, minSide, maxWidth);
    height = clamp(height, minSide, maxHeight);
  }

  return {
    left: west ? anchorX - width : east ? anchorX : start.left,
    top: north ? anchorY - height : south ? anchorY : start.top,
    width,
    height,
  };
}

/** The largest crop of an aspect, centred; the whole source without one. */
export function maximizeCropRect(
  bounds: FileDimensions,
  aspect?: number,
): CropRectF {
  if (!aspect) return { left: 0, top: 0, ...bounds };
  const fraction = centeredCropFraction(bounds, aspect);
  return {
    left: fraction.left * bounds.width,
    top: fraction.top * bounds.height,
    width: fraction.width * bounds.width,
    height: fraction.height * bounds.height,
  };
}

/**
 * Reshapes a crop to a new aspect around its own centre, keeping about the
 * same area, then fits it back inside the source.
 */
export function reshapeCropRect(
  crop: CropRectF,
  bounds: FileDimensions,
  aspect: number,
): CropRectF {
  const area = crop.width * crop.height;
  let width = Math.sqrt(area * aspect);
  let height = width / aspect;
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  width *= scale;
  height *= scale;
  const centerX = crop.left + crop.width / 2;
  const centerY = crop.top + crop.height / 2;
  return {
    left: clamp(centerX - width / 2, 0, bounds.width - width),
    top: clamp(centerY - height / 2, 0, bounds.height - height),
    width,
    height,
  };
}
