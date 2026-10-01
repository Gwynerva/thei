import { column, place, signature, type OgColumnOptions } from '../blocks';
import type { OgDesign } from '../design';
import type { OgFittedStack } from '../fit';
import { ROW, type OgBox } from '../geometry';
import { ogIcon } from '../icons';
import type { OgCardContent } from '../model';
import type { OgPalette } from '../palette';
import type { OgShownPicture } from '../picture';
import { el, type OgNode } from '../render';
import { drawStack, fitStack } from '../stack';

export interface OgLayoutInput {
  content: OgCardContent;
  design: OgDesign;
  palette: OgPalette;
  /** The main picture, when the content has one that could be read. */
  picture?: OgShownPicture;
  /** A project's banner, when it has one that could be read. */
  banner?: OgShownPicture;
  /** The pictures of what the thing gathers, readable ones only. */
  tiles: OgShownPicture[];
}

export interface OgLayoutResult {
  node: OgNode;
  /** Every fitted text stack, by name: what the gallery and tests read. */
  stacks: Record<string, OgFittedStack>;
}

export type OgLayout = (input: OgLayoutInput) => Promise<OgLayoutResult>;

/** Space between a column's stack and the signature anchored below it. */
const SIGNATURE_GAP = 28;

/**
 * A text column with the site's signature anchored at its foot, and the rest
 * of the column's height given to the stack, centred in it.
 */
export async function textColumn(
  input: OgLayoutInput,
  box: OgBox,
  options: Omit<OgColumnOptions, 'width' | 'height'> & {
    signature?: boolean;
    palette?: OgPalette;
  },
): Promise<{ nodes: OgNode[]; fitted: OgFittedStack }> {
  const palette = options.palette ?? input.palette;
  const withSignature = options.signature !== false;
  const height = withSignature
    ? box.height - ROW.signature - SIGNATURE_GAP
    : box.height;
  const { plan, painter } = await column(input.content, palette, {
    ...options,
    width: box.width,
    height,
  });
  const fitted = await fitStack(plan);
  const nodes = [
    drawStack(plan, fitted, { left: box.left, top: box.top }, painter),
  ];
  if (withSignature)
    nodes.push(
      el(
        'div',
        {
          style: {
            ...place({
              left: box.left,
              top: box.top + box.height - ROW.signature,
              width: box.width,
              height: ROW.signature,
            }),
            ...(options.align === 'center' ? { justifyContent: 'center' } : {}),
          },
        },
        await signature(input.content.site, palette, box.width, {
          shrink: options.align === 'center',
        }),
      ),
    );
  return { nodes, fitted };
}

/** The icon a card is known by: its kind's, from its first chip. */
export function kindIcon(content: OgCardContent) {
  return content.chips[0]?.icon ?? 'thei';
}

/**
 * What stands where a picture was expected and none could be read: the
 * accent plate with the kind's icon, the way the site draws a thing without
 * a picture.
 */
export function fallbackArt(
  content: OgCardContent,
  palette: OgPalette,
  width: number,
  height: number,
  style: Record<string, unknown> = {},
): OgNode {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width,
        height,
        background: palette.plate.background,
        ...style,
      },
    },
    ogIcon(
      kindIcon(content),
      palette.plate.text,
      Math.round(Math.min(width, height) * 0.42),
      {
        opacity: 0.9,
      },
    ),
  );
}
