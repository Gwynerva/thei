import sharp from 'sharp';

const HUE_BIN_COUNT = 24;

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
): { lightness: number; a: number; b: number; chroma: number } {
  // Linear sRGB → XYZ D65
  const x = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const y = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const z = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  // XYZ → LMS (cube root)
  const l = x;
  const m = y;
  const s = z;

  // LMS → OKLab
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bVal = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  // Reject near-achromatic colors (chroma too low to have a meaningful hue)
  const chroma = Math.sqrt(a * a + bVal * bVal);
  return { lightness, a, b: bVal, chroma };
}

/**
 * Extracts an accent hue from the strongest perceptual OKLCH color cluster.
 * Transparent and nearly-achromatic pixels are ignored, while clustering
 * prevents opposing colors from cancelling each other out.
 */
export async function extractImageAccentHue(
  buffer: Buffer,
): Promise<number | undefined> {
  const { data, info } = await sharp(buffer)
    .resize(64, 64, { fit: 'contain' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = Array.from({ length: HUE_BIN_COUNT }, () => 0);
  const samples: Array<{ hue: number; weight: number }> = [];

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const alpha = data[offset + 3]! / 255;
    if (alpha < 0.12) continue;
    const color = rgbToOklab(
      linearize(data[offset]!),
      linearize(data[offset + 1]!),
      linearize(data[offset + 2]!),
    );
    if (color.chroma < 0.018) continue;
    const hue = (Math.atan2(color.b, color.a) * (180 / Math.PI) + 360) % 360;
    const visibleLightness =
      0.45 + 0.55 * Math.sin(Math.PI * color.lightness) ** 0.7;
    const weight = alpha * color.chroma ** 1.45 * visibleLightness;
    const bin = Math.floor((hue / 360) * HUE_BIN_COUNT) % HUE_BIN_COUNT;
    bins[bin]! += weight;
    samples.push({ hue, weight });
  }

  if (!samples.length) return undefined;
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

  for (const sample of samples) {
    const distance = Math.abs(((sample.hue - winningCenter + 540) % 360) - 180);
    if (distance > binSize * 1.5) continue;
    const radians = sample.hue * (Math.PI / 180);
    totalSin += Math.sin(radians) * sample.weight;
    totalCos += Math.cos(radians) * sample.weight;
    totalWeight += sample.weight;
  }

  if (!totalWeight) return undefined;
  return Math.round(
    (Math.atan2(totalSin, totalCos) * (180 / Math.PI) + 360) % 360,
  );
}
