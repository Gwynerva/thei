import sharp from 'sharp';

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

/**
 * The density to open `input` at when it is only ever shown scaled down to
 * `targetLongSide` pixels — a preview, an icon, a card. An SVG is drawn at
 * twice that and scaled down, like `svgRasterDensity` does; unlike it, a
 * huge drawing is drawn below its own size too, so a poster-sized SVG never
 * becomes a raster far larger than the icon made of it.
 *
 * `undefined` for anything that is not an SVG, which needs no density, and
 * for a file that cannot be read.
 */
export async function svgDensityFor(
  input: string | Buffer,
  targetLongSide: number,
): Promise<number | undefined> {
  // Only the header is read, so the pixel limit, which would refuse a huge
  // drawing at its default size, does not apply yet: it still guards the
  // raster drawn at the density returned.
  const metadata = await sharp(input, { limitInputPixels: false })
    .metadata()
    .catch(() => undefined);
  if (metadata?.format !== 'svg' || !metadata.width || !metadata.height)
    return undefined;
  const longSide = Math.max(metadata.width, metadata.height);
  const scale = Math.min(
    (2 * targetLongSide) / longSide,
    SVG_MAX_RASTER_SIDE / longSide,
  );
  return SVG_BASE_DENSITY * scale;
}
