export function accentHueCssColor(
  hue: number | undefined,
  fallback: string,
  alpha?: number,
) {
  if (hue === undefined) return fallback;
  const alphaChannel = alpha === undefined ? '' : ` / ${alpha}`;
  return `oklch(var(--lightness-accent) var(--chroma-accent) ${hue}${alphaChannel})`;
}

export function oklchToHex(lightness: number, chroma: number, hue: number) {
  const radians = hue * (Math.PI / 180);
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linear
    .map((channel) => {
      const encoded =
        channel <= 0.0031308
          ? 12.92 * channel
          : 1.055 * channel ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}
