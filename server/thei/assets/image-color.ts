import sharp from 'sharp';
import { IMAGE_EXTENSIONS } from '#layers/thei/shared/assets/formats';

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);

/** sRGB channel value (0–255) → linear light */
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Linear sRGB { r, g, b } (0–1 range) → OKLCH hue in degrees (0–359), or undefined if achromatic */
function rgbToOklab(
  r: number,
  g: number,
  b: number,
): { a: number; b: number; chroma: number } {
  // Linear sRGB → XYZ D65
  const x = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const y = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const z = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  // XYZ → LMS (cube root)
  const l = x;
  const m = y;
  const s = z;

  // LMS → OKLab
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bVal = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  // Reject near-achromatic colors (chroma too low to have a meaningful hue)
  const chroma = Math.sqrt(a * a + bVal * bVal);
  return { a, b: bVal, chroma };
}

function rgbToOklchHue(r: number, g: number, b: number): number | undefined {
  const { a, b: bVal, chroma } = rgbToOklab(r, g, b);
  if (chroma < 0.02) return undefined;

  const hue = (Math.atan2(bVal, a) * (180 / Math.PI) + 360) % 360;
  return Math.round(hue);
}

/**
 * Extracts an accent hue while ignoring transparent and nearly-achromatic
 * pixels. Weighting by chroma prevents transparent padding or a neutral
 * background from winning over a logo's actual brand color.
 */
export async function extractImageAccentHue(
  buffer: Buffer,
): Promise<number | undefined> {
  const { data, info } = await sharp(buffer)
    .resize(48, 48, { fit: 'contain' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let totalA = 0;
  let totalB = 0;
  let totalWeight = 0;

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const alpha = data[offset + 3]! / 255;
    if (alpha < 0.12) continue;
    const color = rgbToOklab(
      linearize(data[offset]!),
      linearize(data[offset + 1]!),
      linearize(data[offset + 2]!),
    );
    if (color.chroma < 0.025) continue;
    const weight = alpha * color.chroma ** 1.5;
    totalA += color.a * weight;
    totalB += color.b * weight;
    totalWeight += weight;
  }

  if (!totalWeight) return undefined;
  return Math.round(
    (Math.atan2(totalB / totalWeight, totalA / totalWeight) * (180 / Math.PI) +
      360) %
      360,
  );
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
