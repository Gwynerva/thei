import satori, { type SatoriOptions } from 'satori';
import sharp from 'sharp';

/**
 * Turning a layout into a PNG.
 *
 * Satori lays the card out with real font metrics and writes the text as
 * paths, so nothing depends on which fonts the server has installed; sharp
 * then rasterises that SVG. The alternative — estimating text width by
 * counting characters — is what the previous attempt at this did, and it
 * breaks the moment a title is in a different script.
 */
export const OG_FONT_FAMILY = 'Noto Sans, Noto Sans Cyrillic';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** A React-element-like node; satori reads this shape without React. */
export interface OgNode {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
}

export function el(
  type: string,
  props: Record<string, unknown>,
  ...children: unknown[]
): OgNode {
  return {
    type,
    props: {
      ...props,
      ...(children.length
        ? { children: children.length === 1 ? children[0] : children }
        : {}),
    },
  };
}

let fontsPromise: Promise<SatoriOptions['fonts']> | undefined;

async function loadFonts(): Promise<SatoriOptions['fonts']> {
  fontsPromise ??= (async () => {
    const storage = useStorage('assets:thei-og-fonts');
    const entries = [
      ['latin', 400],
      ['latin', 700],
      ['cyrillic', 400],
      ['cyrillic', 700],
    ] as const;
    // Each subset is registered under its own family name: given two fonts
    // of one name, satori keeps the first and the other script comes out as
    // empty boxes. Listed as a family stack, it falls back per glyph instead.
    const fonts = await Promise.all(
      entries.map(async ([subset, weight]) => {
        const data = (await storage.getItemRaw(
          `noto-sans-${subset}-${weight}-normal.woff`,
        )) as Buffer;
        return {
          name: subset === 'latin' ? 'Noto Sans' : 'Noto Sans Cyrillic',
          data,
          weight: weight as 400 | 700,
          style: 'normal' as const,
        };
      }),
    );
    return fonts;
  })();
  return fontsPromise;
}

export async function renderOgSvg(
  node: OgNode,
  options: { width: number; height?: number },
): Promise<string> {
  const fonts = await loadFonts();
  return satori(node as never, {
    ...(options.height
      ? { width: options.width, height: options.height }
      : { width: options.width }),
    fonts,
  });
}

export async function renderOgPng(node: OgNode): Promise<Buffer> {
  const svg = await renderOgSvg(node, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
  });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

/**
 * The largest size at which the text still fits the space it was given.
 *
 * Satori can lay out at an unconstrained height, so the fit is measured
 * instead of guessed: the same text block is laid out at each candidate size
 * and the first one that stays within `maxHeight` wins. A size that would
 * split the longest word across lines is passed over first — a broken word
 * reads worse than smaller type — and only the smallest size accepts one. At
 * that size the text is clamped to `maxLines` and ends in an ellipsis rather
 * than overflowing the card.
 */
export async function fitText(
  text: string,
  options: {
    width: number;
    maxHeight: number;
    sizes: number[];
    lineHeight: number;
    weight: number;
    maxLines: number;
  },
): Promise<{ fontSize: number; lineClamp: number }> {
  const longestWord = text
    .split(/\s+/)
    .reduce(
      (longest, word) => (word.length > longest.length ? word : longest),
      '',
    );
  const measure = async (value: string, fontSize: number) => {
    const svg = await renderOgSvg(
      el('div', {
        style: {
          display: 'flex',
          fontSize,
          lineHeight: options.lineHeight,
          fontWeight: options.weight,
          fontFamily: OG_FONT_FAMILY,
          // Measured the way it is drawn: a single word longer than the line
          // wraps here too, so its height is the height the card will get.
          wordBreak: 'break-word',
        },
        children: value,
      }),
      { width: options.width },
    );
    return Number(/height="(\d+(?:\.\d+)?)"/.exec(svg)?.[1] ?? 0);
  };

  for (const fontSize of options.sizes) {
    const height = await measure(text, fontSize);
    if (!height || height > options.maxHeight) continue;
    // One line's worth of height means the longest word was left whole.
    const wordHeight = longestWord ? await measure(longestWord, fontSize) : 0;
    if (wordHeight <= fontSize * options.lineHeight * 1.05)
      return { fontSize, lineClamp: 0 };
  }
  const smallest = options.sizes.at(-1)!;
  return { fontSize: smallest, lineClamp: options.maxLines };
}
