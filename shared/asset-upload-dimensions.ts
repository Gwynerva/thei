import type { AssetUploadDimensions } from './asset-upload-settings';

export interface FileDimensions {
  width: number;
  height: number;
}

export const ASSET_SIZE_PRESETS = [360, 720, 1280, 1920, 2560] as const;

export function parseAssetDimensionInput(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function dimensionsEqual(
  first: AssetUploadDimensions | undefined,
  second: AssetUploadDimensions | undefined,
): boolean {
  return (
    (first?.width ?? 0) === (second?.width ?? 0) &&
    (first?.height ?? 0) === (second?.height ?? 0)
  );
}

export function getAvailableAssetSizePresets(
  dimensions: FileDimensions | undefined,
): number[] {
  if (!dimensions) return [];
  const longSide = Math.max(dimensions.width, dimensions.height);
  return ASSET_SIZE_PRESETS.filter((preset) => preset <= longSide);
}

export function resizeDimensionsByLongSide(
  dimensions: FileDimensions,
  longSide: number,
): FileDimensions {
  const originalLongSide = Math.max(dimensions.width, dimensions.height);
  if (originalLongSide <= 0) return dimensions;

  const scale = longSide / originalLongSide;
  return {
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
  };
}

export function fitDimensionsInsideLongSide(
  dimensions: FileDimensions,
  maxLongSide: number,
): FileDimensions {
  const longSide = Math.max(dimensions.width, dimensions.height);
  return longSide > maxLongSide
    ? resizeDimensionsByLongSide(dimensions, maxLongSide)
    : dimensions;
}

export function evenDimensions(dimensions: FileDimensions): FileDimensions {
  return {
    width: Math.max(2, dimensions.width - (dimensions.width % 2)),
    height: Math.max(2, dimensions.height - (dimensions.height % 2)),
  };
}

export function calculatePreviewDimensions(
  source: FileDimensions | undefined,
  requested: AssetUploadDimensions,
): FileDimensions | undefined {
  if (!source) return undefined;
  const width = requested.width;
  const height = requested.height;

  if (width && height) {
    return { width, height };
  }

  if (width) {
    return {
      width,
      height: Math.max(1, Math.round((width * source.height) / source.width)),
    };
  }

  if (height) {
    return {
      width: Math.max(1, Math.round((height * source.width) / source.height)),
      height,
    };
  }

  return source;
}
