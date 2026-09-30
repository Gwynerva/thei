import satori from 'satori';
import sharp from 'sharp';
import { loadOgFonts } from './fonts';

/**
 * Turning a layout into a PNG.
 *
 * Satori lays the card out with real font metrics and writes the text as
 * paths, so nothing depends on which fonts the server has installed; sharp
 * then rasterises that SVG. The alternative — estimating text width by
 * counting characters — is what the previous attempt at this did, and it
 * breaks the moment a title is in a different script.
 */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** A React-element-like node; satori reads this shape without React. */
export interface OgNode {
  type: string;
  key?: string;
  props: Record<string, unknown> & { children?: unknown };
}

/**
 * A node, with its `key` lifted out of the props: satori reports a laid-out
 * box under the key of the element itself, which is how a card measures what
 * it is about to draw.
 */
export function el(
  type: string,
  { key, style, ...props }: Record<string, unknown>,
  ...children: unknown[]
): OgNode {
  return {
    type,
    ...(typeof key === 'string' ? { key } : {}),
    props: {
      ...props,
      // Satori fails on a style property that is present but undefined, and
      // layouts build their styles from optional parts.
      ...(style && typeof style === 'object'
        ? {
            style: Object.fromEntries(
              Object.entries(style).filter(([, value]) => value !== undefined),
            ),
          }
        : {}),
      ...(children.length
        ? { children: children.length === 1 ? children[0] : children }
        : {}),
    },
  };
}

/** A box satori laid out, in pixels from the top left of the picture. */
export interface OgLaidOutNode {
  key?: string;
  type: string;
  left: number;
  top: number;
  width: number;
  height: number;
  textContent?: string;
}

/**
 * Called for every run of text no shipped font can draw.
 *
 * Satori would ask for more fonts here; a card has none to offer, so the run
 * comes out as empty boxes. Text is filtered before it reaches a card, which
 * makes a call here a bug, and tests listen for it.
 */
let missingGlyphs: ((language: string, segment: string) => void) | undefined;

export function onOgMissingGlyphs(
  listener: ((language: string, segment: string) => void) | undefined,
) {
  missingGlyphs = listener;
}

export async function renderOgSvg(
  node: OgNode,
  options: {
    width: number;
    height?: number;
    onNode?: (node: OgLaidOutNode) => void;
  },
): Promise<string> {
  const fonts = await loadOgFonts();
  return satori(node as never, {
    ...(options.height
      ? { width: options.width, height: options.height }
      : { width: options.width }),
    fonts,
    ...(options.onNode
      ? {
          onNodeDetected: (detected) =>
            options.onNode!({
              key: typeof detected.key === 'string' ? detected.key : undefined,
              type: String(detected.type),
              left: detected.left,
              top: detected.top,
              width: detected.width,
              height: detected.height,
              textContent: detected.textContent,
            }),
        }
      : {}),
    loadAdditionalAsset: async (language, segment) => {
      missingGlyphs?.(language, segment);
      return [];
    },
  });
}

export async function renderOgPng(node: OgNode): Promise<Buffer> {
  const svg = await renderOgSvg(node, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
  });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
