/** librsvg's own resolution: one SVG unit becomes one pixel. */
export const SVG_BASE_DENSITY = 72;

/** Longest side an SVG is ever rasterised to before it is scaled down. */
const SVG_MAX_RASTER_SIDE = 16384;

/**
 * The density to rasterise an SVG at, for an output that shows each of its
 * units at `scale` pixels.
 *
 * At librsvg's default 72 dpi a small drawing asked for at a large size is
 * rasterised small and then enlarged, which blurs it. Rendering at twice the
 * needed resolution and scaling down keeps edges crisp; the cap keeps a tiny
 * crop of a huge drawing from asking for a raster no machine can hold.
 */
export function svgRasterDensity(
  scale: number,
  intrinsicLongSide: number,
): number {
  const wanted = SVG_BASE_DENSITY * Math.max(1, scale * 2);
  const limit =
    (SVG_BASE_DENSITY * SVG_MAX_RASTER_SIDE) / Math.max(1, intrinsicLongSide);
  return Math.max(SVG_BASE_DENSITY, Math.min(wanted, limit));
}
