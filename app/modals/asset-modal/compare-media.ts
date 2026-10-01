export interface CompareMediaDimensions {
  width: number;
  height: number;
}

export type CompareMediaSide = 'original' | 'modified';
export type CompareMediaMode = 'seamless' | 'real';

export interface CompareMediaLayout {
  base: CompareMediaDimensions;
  originalScale: number;
  modifiedScale: number;
}

export interface CompareSideMetrics {
  scale: number;
  width: number;
  height: number;
}

export function buildCompareMediaLayout(
  original: CompareMediaDimensions,
  modified: CompareMediaDimensions,
  mode: CompareMediaMode = 'real',
): CompareMediaLayout {
  if (mode === 'seamless') {
    const base = pickSeamlessCompareBaseDimensions(original, modified);

    return {
      base,
      originalScale: calculateContainScale(original, base),
      modifiedScale: calculateContainScale(modified, base),
    };
  }

  return {
    base: pickCompareNavigationDimensions(original, modified),
    originalScale: 1,
    modifiedScale: 1,
  };
}

export function pickSeamlessCompareBaseDimensions(
  original: CompareMediaDimensions,
  modified: CompareMediaDimensions,
): CompareMediaDimensions {
  const originalFitsModified = fitsInside(original, modified);
  const modifiedFitsOriginal = fitsInside(modified, original);

  if (originalFitsModified && !modifiedFitsOriginal) return original;
  if (modifiedFitsOriginal && !originalFitsModified) return modified;

  return area(original) <= area(modified) ? original : modified;
}

export function pickCompareNavigationDimensions(
  original: CompareMediaDimensions,
  modified: CompareMediaDimensions,
): CompareMediaDimensions {
  return {
    width: Math.max(original.width, modified.width),
    height: Math.max(original.height, modified.height),
  };
}

/**
 * Device pixels per one of a side's own pixels at the shared zoom.
 *
 * Measured in device pixels, not CSS pixels: a screen scaled to 125 % and a
 * browser zoomed in both put more than one device pixel under a CSS pixel,
 * and an image shown at "100 %" of its CSS size is then resampled — which
 * looks like blur the file does not have.
 */
export function compareSideDeviceScale(
  sharedZoom: number,
  normalizeScale: number,
  devicePixelRatio = 1,
): number {
  return sharedZoom * normalizeScale * devicePixelRatio;
}

export function compareZoomPercent(
  sharedZoom: number,
  normalizeScale: number,
  devicePixelRatio = 1,
): number {
  return Math.round(
    compareSideDeviceScale(sharedZoom, normalizeScale, devicePixelRatio) * 100,
  );
}

/** The shared zoom at which a side shows each of its pixels on one device pixel. */
export function compareSideZoomTarget(
  normalizeScale: number,
  devicePixelRatio = 1,
): number {
  return normalizeScale > 0 ? 1 / (normalizeScale * devicePixelRatio) : 1;
}

/**
 * How the browser should sample a side drawn at this many device pixels per
 * pixel of its own. From one up, every pixel of the file is on screen and
 * nearest-neighbour sampling draws it exactly, magnified or not; below one
 * some pixels have to go, and smooth scaling reads better than dropping them.
 */
export function exactImageRendering(deviceScale: number): 'pixelated' | 'auto' {
  return deviceScale >= 1 - 1e-3 ? 'pixelated' : 'auto';
}

export function getCompareSideMetrics(
  layout: CompareMediaLayout,
  side: CompareMediaSide,
  dimensions: CompareMediaDimensions,
): CompareSideMetrics {
  const scale =
    side === 'original' ? layout.originalScale : layout.modifiedScale;

  return {
    scale,
    width: dimensions.width * scale,
    height: dimensions.height * scale,
  };
}

export function compareFitZoomTarget(
  sideMetrics: CompareSideMetrics,
  container: CompareMediaDimensions,
  padding = 0,
  capAtSideHundred = true,
  devicePixelRatio = 1,
): number {
  if (sideMetrics.width <= 0 || sideMetrics.height <= 0) return 1;

  const availableWidth = Math.max(container.width - padding, 1);
  const availableHeight = Math.max(container.height - padding, 1);
  const fitZoom = Math.min(
    availableWidth / sideMetrics.width,
    availableHeight / sideMetrics.height,
  );

  return capAtSideHundred
    ? Math.min(
        fitZoom,
        compareSideZoomTarget(sideMetrics.scale, devicePixelRatio),
      )
    : fitZoom;
}

function calculateContainScale(
  source: CompareMediaDimensions,
  target: CompareMediaDimensions,
): number {
  if (source.width <= 0 || source.height <= 0) return 1;

  return Math.min(
    target.width / source.width,
    target.height / source.height,
    1,
  );
}

function fitsInside(
  source: CompareMediaDimensions,
  target: CompareMediaDimensions,
): boolean {
  return source.width <= target.width && source.height <= target.height;
}

function area(dimensions: CompareMediaDimensions): number {
  return dimensions.width * dimensions.height;
}
