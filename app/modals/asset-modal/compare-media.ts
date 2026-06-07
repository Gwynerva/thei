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

export function compareZoomPercent(
  sharedZoom: number,
  normalizeScale: number,
): number {
  return Math.round(sharedZoom * normalizeScale * 100);
}

export function compareSideZoomTarget(normalizeScale: number): number {
  return normalizeScale > 0 ? 1 / normalizeScale : 1;
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
): number {
  if (sideMetrics.width <= 0 || sideMetrics.height <= 0) return 1;

  const availableWidth = Math.max(container.width - padding, 1);
  const availableHeight = Math.max(container.height - padding, 1);
  const fitZoom = Math.min(
    availableWidth / sideMetrics.width,
    availableHeight / sideMetrics.height,
  );

  return capAtSideHundred
    ? Math.min(fitZoom, compareSideZoomTarget(sideMetrics.scale))
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
