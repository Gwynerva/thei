import sharp from 'sharp';
import type { ImageAccent } from '#layers/thei/shared/accent-color';
import {
  linearSrgbToOklab,
  srgbChannelToLinear,
} from '#layers/thei/shared/oklch';

const HUE_BIN_COUNT = 24;

/** sRGB channels (0–255) → the chromatic components of OKLab. */
function rgbToOklab(
  red: number,
  green: number,
  blue: number,
): { a: number; b: number; chroma: number } {
  const { a, b } = linearSrgbToOklab(
    srgbChannelToLinear(red),
    srgbChannelToLinear(green),
    srgbChannelToLinear(blue),
  );
  return { a, b, chroma: Math.sqrt(a * a + b * b) };
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
      data[offset]!,
      data[offset + 1]!,
      data[offset + 2]!,
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
