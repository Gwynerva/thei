import sharp from 'sharp';
import type { ImageAccent } from '#layers/thei/shared/accent-color';

const HUE_BIN_COUNT = 24;

/** sRGB channel value (0–255) → linear light */
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Linear sRGB (0–1) → perceptual chromatic components in OKLab. */
function rgbToOklab(
  r: number,
  g: number,
  b: number,
): { a: number; b: number; chroma: number } {
  // Linear sRGB → cube-root LMS.
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  // LMS → OKLab
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bVal = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const chroma = Math.sqrt(a * a + bVal * bVal);
  return { a, b: bVal, chroma };
}

/**
 * Select a representative hue by visible area, retaining its actual chroma.
 * Neutral pixels contribute to coverage so a small colorful detail cannot
 * tint a predominantly neutral image. Transparent padding contributes nothing.
 */
export async function extractImageAccent(
  buffer: Buffer,
): Promise<ImageAccent | undefined> {
  const { data, info } = await sharp(buffer)
    .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = Array.from({ length: HUE_BIN_COUNT }, () => 0);
  const samples: Array<{ hue: number; weight: number; chroma: number }> = [];
  let visibleArea = 0;
  let chromaticArea = 0;

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const alpha = data[offset + 3]! / 255;
    if (alpha < 0.12) continue;
    visibleArea += alpha;
    const color = rgbToOklab(
      linearize(data[offset]!),
      linearize(data[offset + 1]!),
      linearize(data[offset + 2]!),
    );
    if (color.chroma < 0.018) continue;
    const hue = (Math.atan2(color.b, color.a) * (180 / Math.PI) + 360) % 360;
    const weight = alpha;
    chromaticArea += weight;
    const bin = Math.floor((hue / 360) * HUE_BIN_COUNT) % HUE_BIN_COUNT;
    bins[bin]! += weight;
    samples.push({ hue, weight, chroma: color.chroma });
  }

  if (!visibleArea) return undefined;
  const coverage = chromaticArea / visibleArea;
  if (coverage <= 0.2) return { hue: 0, chroma: 0 };
  const smoothed = bins.map(
    (weight, index) =>
      weight +
      bins[(index + HUE_BIN_COUNT - 1) % HUE_BIN_COUNT]! * 0.55 +
      bins[(index + 1) % HUE_BIN_COUNT]! * 0.55,
  );
  const winningBin = smoothed.reduce(
    (best, weight, index) => (weight > best.weight ? { index, weight } : best),
    { index: 0, weight: -1 },
  ).index;
  const binSize = 360 / HUE_BIN_COUNT;
  const winningCenter = (winningBin + 0.5) * binSize;
  let totalSin = 0;
  let totalCos = 0;
  let totalWeight = 0;
  let totalChroma = 0;

  for (const sample of samples) {
    const distance = Math.abs(((sample.hue - winningCenter + 540) % 360) - 180);
    if (distance > binSize * 1.5) continue;
    const radians = sample.hue * (Math.PI / 180);
    totalSin += Math.sin(radians) * sample.weight;
    totalCos += Math.cos(radians) * sample.weight;
    totalWeight += sample.weight;
    totalChroma += sample.chroma * sample.weight;
  }

  if (!totalWeight) return { hue: 0, chroma: 0 };
  // Smoothstep avoids a saturation jump near the neutral coverage threshold.
  const t = Math.min(1, (coverage - 0.2) / 0.2);
  const chroma = Number(
    ((totalChroma / totalWeight) * t * t * (3 - 2 * t)).toFixed(5),
  );
  const hue =
    Math.round((Math.atan2(totalSin, totalCos) * (180 / Math.PI) + 360) % 360) %
    360;
  return { hue: chroma === 0 ? 0 : hue, chroma };
}
