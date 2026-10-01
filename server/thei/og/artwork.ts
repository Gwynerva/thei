import sharp from 'sharp';
import type { ImageAccent } from '#layers/thei/shared/accent-color';
import {
  linearSrgbToOklch,
  srgbChannelToLinear,
  srgbLuminance,
} from '#layers/thei/shared/oklch';
import { extractImageAccent } from '../assets/image-color';
import { svgDensityFor } from '../assets/svg-density';
import { withRasterReadySvg } from '../assets/svg-raster-input';
import { buildIconSvg } from '../media/generated-icon';
import type { OgPicture } from './model';

/**
 * Looking at a picture before deciding how to show it.
 *
 * A layout needs to know whether a picture is an icon — a logo on a flat or
 * transparent field, which must be shown whole — or a photograph that can
 * fill a frame; how light it is, so the card around it can suit it; and how
 * bright it is where a project's words sit over its banner, so the shade
 * under them is dark enough. One small decode answers all of that.
 */
export interface OgArtworkAnalysis {
  width: number;
  height: number;
  aspect: number;
  /** Share of the picture that is see-through. */
  transparent: number;
  /** Share of its border that is one flat colour. */
  flat: number;
  /** Mean OKLab lightness of what is visible, 0–1. */
  lightness: number;
  /** Mean OKLab chroma of what is visible. */
  chroma: number;
  accent?: ImageAccent;
  /**
   * The brightest tenth, as relative luminance, of the left 60% of the
   * picture cropped to fill a card: what words laid over it sit on.
   */
  coverBright: number;
  /** A logo or an icon rather than a photograph: shown whole. */
  iconLike: boolean;
}

const ANALYSIS_SIZE = 96;
const CACHE_LIMIT = 256;
const cache = new Map<string, Promise<OgArtworkAnalysis | undefined>>();

function pictureKey(picture: OgPicture) {
  return picture.type === 'file'
    ? `file:${picture.key}`
    : `generated:${picture.kind}:${picture.hue}`;
}

/**
 * Runs `use` with the bytes sharp should open, at a density that draws a
 * vector picture crisply at `longSide` pixels. A stored SVG is prepared for
 * librsvg first, which draws some of them unlike a browser.
 */
async function withPictureInput<T>(
  picture: OgPicture,
  longSide: number,
  use: (input: string | Buffer, density: number | undefined) => Promise<T>,
): Promise<T> {
  if (picture.type === 'generated')
    return await use(
      Buffer.from(buildIconSvg(picture.kind, picture.hue)),
      // The drawing is 960 units square.
      Math.max(72, (72 * 2 * longSide) / 960),
    );
  const density = await svgDensityFor(picture.file, longSide);
  return await withRasterReadySvg(picture.file, (input) => use(input, density));
}

function classify(
  analysis: Omit<OgArtworkAnalysis, 'iconLike'>,
): OgArtworkAnalysis {
  return {
    ...analysis,
    iconLike:
      analysis.transparent > 0.15 ||
      analysis.flat > 0.85 ||
      Math.max(analysis.width, analysis.height) < 400,
  };
}

async function analyze(
  picture: OgPicture,
): Promise<OgArtworkAnalysis | undefined> {
  if (picture.type === 'generated')
    // The site's drawn icons are known without looking: square, opaque, a
    // glyph on a radial field of the accent.
    return classify({
      width: 256,
      height: 256,
      aspect: 1,
      transparent: 0,
      flat: 0,
      lightness: 0.6,
      chroma: 0.13,
      accent: { hue: picture.hue, chroma: 0.15 },
      coverBright: 0.35,
    });

  return await withPictureInput(picture, ANALYSIS_SIZE, (input, density) =>
    analyzeInput(picture, input, density),
  );
}

async function analyzeInput(
  picture: Extract<OgPicture, { type: 'file' }>,
  input: string | Buffer,
  density: number | undefined,
): Promise<OgArtworkAnalysis | undefined> {
  const image = () => sharp(input, { density });
  const metadata = await image().metadata();
  const width = picture.width ?? metadata.width ?? 0;
  const height = picture.height ?? metadata.height ?? 0;
  if (!width || !height) return undefined;

  const { data, info } = await image()
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'inside' })
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let visible = 0;
  let transparent = 0;
  let lightness = 0;
  let chroma = 0;
  const border: { l: number; a: number; b: number }[] = [];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      const alpha = data[offset + 3]! / 255;
      if (alpha < 0.5) transparent++;
      const color = linearSrgbToOklch(
        srgbChannelToLinear(data[offset]!),
        srgbChannelToLinear(data[offset + 1]!),
        srgbChannelToLinear(data[offset + 2]!),
      );
      visible += alpha;
      lightness += color.l * alpha;
      chroma += color.c * alpha;
      const edge =
        x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1;
      if (edge && alpha >= 0.5) {
        const radians = (color.h * Math.PI) / 180;
        border.push({
          l: color.l,
          a: color.c * Math.cos(radians),
          b: color.c * Math.sin(radians),
        });
      }
    }
  const pixels = info.width * info.height;

  // How much of the border is one colour: its median, and who is near it.
  let flat = 0;
  if (border.length) {
    const median = (values: number[]) =>
      values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    const centre = {
      l: median(border.map(({ l }) => l)),
      a: median(border.map(({ a }) => a)),
      b: median(border.map(({ b }) => b)),
    };
    flat =
      border.filter(
        ({ l, a, b }) =>
          Math.hypot(l - centre.l, a - centre.a, b - centre.b) < 0.04,
      ).length / border.length;
  }

  // Brightness under words laid over the picture: the left 60% of it,
  // cropped to fill a card.
  const cover = await image()
    .resize(120, 63, { fit: 'cover' })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luminances: number[] = [];
  for (let y = 0; y < cover.info.height; y++)
    for (let x = 0; x < 72; x++) {
      const offset = (y * cover.info.width + x) * cover.info.channels;
      luminances.push(
        srgbLuminance(
          cover.data[offset]!,
          cover.data[offset + 1]!,
          cover.data[offset + 2]!,
        ),
      );
    }
  luminances.sort((a, b) => a - b);

  const accent =
    picture.accent ??
    (await extractImageAccent(
      await image().resize(128, 128, { fit: 'inside' }).png().toBuffer(),
    ));

  return classify({
    width,
    height,
    aspect: width / height,
    transparent: transparent / pixels,
    flat,
    lightness: visible ? lightness / visible : 0,
    chroma: visible ? chroma / visible : 0,
    accent,
    coverBright: luminances[Math.floor(luminances.length * 0.9)] ?? 0,
  });
}

/**
 * What a picture looks like, or nothing when it cannot be read: a card then
 * draws without it rather than failing.
 */
export function analyzePicture(
  picture: OgPicture,
): Promise<OgArtworkAnalysis | undefined> {
  const key = pictureKey(picture);
  let result = cache.get(key);
  if (!result) {
    result = analyze(picture).catch(() => undefined);
    cache.set(key, result);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  }
  return result;
}

/**
 * Whether a picture may be cropped to fill a box: a photograph whose shape
 * is near the box's. An icon is never cropped, nor is a picture that would
 * lose more than a fifth of itself.
 */
export function fillsBox(
  analysis: OgArtworkAnalysis,
  width: number,
  height: number,
): boolean {
  if (analysis.iconLike)
    return Math.abs(analysis.aspect - width / height) < 0.02;
  return (
    Math.abs(Math.log(analysis.aspect / (width / height))) <= Math.log(1.25)
  );
}

/**
 * The stops of an SVG gradient that goes from clear at `from` to opaque at
 * `to`, both shares of its length, along a smoothstep — the curve the site's
 * edge media dissolves along. A straight ramp shows where it starts and where
 * it ends, which reads as an edge.
 */
export function easedFadeStops(from: number, to: number): string {
  return Array.from({ length: 11 }, (_, index) => {
    const t = index / 10;
    const opacity = t * t * (3 - 2 * t);
    const offset = from + (to - from) * t;
    return `<stop offset="${+offset.toFixed(4)}" stop-color="#fff" stop-opacity="${+opacity.toFixed(4)}"/>`;
  }).join('');
}

/**
 * A picture as a data URI, at exactly the size it is drawn — satori reads
 * PNG and JPEG only, and the library mostly holds AVIF and WebP.
 *
 * A picture that keeps its transparency — contained, see-through in the
 * first place, or faded — becomes a PNG; anything else a JPEG, a fraction of
 * the size.
 *
 * `fade` dissolves the picture's left edge into whatever is behind it: fully
 * transparent at `from` and fully opaque from `to`, both shares of its
 * width, eased in between. It is baked into the picture, as satori has no
 * masks.
 */
export async function pictureDataUri(
  picture: OgPicture,
  width: number,
  height: number,
  options: {
    fit: 'cover' | 'contain';
    blur?: number;
    alpha?: boolean;
    fade?: { from: number; to: number };
  },
): Promise<string | undefined> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  try {
    return await withPictureInput(picture, Math.max(w, h), (input, density) =>
      drawPicture(input, density, w, h, options),
    );
  } catch {
    return undefined;
  }
}

async function drawPicture(
  input: string | Buffer,
  density: number | undefined,
  w: number,
  h: number,
  options: Parameters<typeof pictureDataUri>[3],
): Promise<string> {
  let pipeline = sharp(input, { density }).resize(w, h, {
    fit: options.fit,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (options.blur) pipeline = pipeline.blur(options.blur);
  if (options.fade) {
    // Composited after the resize and the blur, at the drawn size.
    pipeline = sharp(await pipeline.ensureAlpha().png().toBuffer()).composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="0">${easedFadeStops(options.fade.from, options.fade.to)}</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#f)"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ]);
  }
  const png =
    Boolean(options.fade) ||
    (!options.blur && (options.fit === 'contain' || options.alpha));
  const buffer = png
    ? await pipeline.png({ compressionLevel: 6 }).toBuffer()
    : await pipeline
        .flatten({ background: '#808080' })
        .jpeg({ quality: 84 })
        .toBuffer();
  return `data:image/${png ? 'png' : 'jpeg'};base64,${buffer.toString('base64')}`;
}
