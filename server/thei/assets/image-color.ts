import sharp from 'sharp';
import { IMAGE_EXTENSIONS } from '#layers/thei/shared/asset';

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);

/** sRGB channel value (0–255) → linear light */
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Linear sRGB { r, g, b } (0–1 range) → OKLCH hue in degrees (0–359), or undefined if achromatic */
function rgbToOklchHue(r: number, g: number, b: number): number | undefined {
  // Linear sRGB → XYZ D65
  const x = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const y = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const z = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  // XYZ → LMS (cube root)
  const l = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
  const m = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
  const s = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);

  // LMS → OKLab
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bVal = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  // Reject near-achromatic colors (chroma too low to have a meaningful hue)
  const chroma = Math.sqrt(a * a + bVal * bVal);
  if (chroma < 0.02) return undefined;

  const hue = (Math.atan2(bVal, a) * (180 / Math.PI) + 360) % 360;
  return Math.round(hue);
}

/**
 * Extracts the dominant hue (0–359) from an image buffer using sharp's color
 * histogram. Returns undefined for non-raster images (e.g. SVG) or achromatic images.
 */
export async function extractDominantHue(
  buffer: Buffer,
  extension: string,
): Promise<number | undefined> {
  if (!IMAGE_EXTS.has(extension) || extension === 'svg') return undefined;

  const { dominant } = await sharp(buffer).stats();

  const r = linearize(dominant.r);
  const g = linearize(dominant.g);
  const b = linearize(dominant.b);

  return rgbToOklchHue(r, g, b);
}
