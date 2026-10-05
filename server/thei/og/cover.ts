import type { ImageAccent } from '#layers/thei/shared/accent-color';
import {
  blendHex,
  relativeLuminance,
  withAlpha,
} from '#layers/thei/shared/oklch';
import { accentField, place } from './blocks';
import { easedShadeStops, pictureDataUri } from './artwork';
import { OG_HEIGHT, OG_WIDTH } from './geometry';
import { coverScrim, vividPlate, type OgPalette } from './palette';
import type { OgShownPicture } from './picture';
import { el, type OgNode } from './render';

/**
 * A picture as the ground of a card, the way a page's hero lays its banner:
 * at full height on the right in its own proportions, dissolving leftwards
 * into a blurred copy of itself that fills the card, with a light shade
 * under the words that lets go along an eased curve, so that nowhere shows a
 * line. A project's card lays its banner so, a section's or an event's its
 * picture; one without lays a field of its accent there instead.
 */

const WHITE = '#ffffff';
/** The column the words take: two thirds, as on the page. */
export const COVER_WORDS_WIDTH = 700;
/** The picture's widest; a wider one loses its sides to fit. */
const PICTURE_MAX = 1000;
/** How much of the picture, from its left edge, dissolves into the card. */
const PICTURE_FADE = 0.55;
/**
 * The shade under the words: never lighter than this where the words start,
 * so the picture behind them is a mood rather than a second thing to read,
 * solid to `SHADE_SOLID` and clear by `SHADE_END`, the card's edge. It lifts
 * across most of the card, the right half of the words included, along a
 * curve level at both ends, so nowhere can be pointed at as where it starts
 * or ends; the halo keeps the words readable where it has thinned.
 */
const SHADE_MIN = 0.6;
const SHADE_SOLID = 0.3;
const SHADE_END = 1;
/**
 * A halo of the shade's colour behind every word, as the page's header has:
 * it keeps the words readable where the shade has begun to lift under them.
 */
const HALO = [
  { blur: 10, alpha: 0.85 },
  { blur: 26, alpha: 0.7 },
];

export interface OgCoverGround {
  /** The blurred copy over the card, then the picture itself on the right. */
  layers: OgNode[];
  /** How bright the ground is at its lightest where the words sit. */
  bright: number;
}

/**
 * A picture as the ground, or nothing when it cannot be drawn and the card
 * is better off with a field of its accent.
 */
export async function pictureCover(
  shown: OgShownPicture,
): Promise<OgCoverGround | undefined> {
  const width = Math.min(
    PICTURE_MAX,
    Math.round(OG_HEIGHT * shown.analysis.aspect),
  );
  const [backdrop, src] = await Promise.all([
    pictureDataUri(shown.picture, 300, 158, { fit: 'cover', blur: 6 }),
    pictureDataUri(shown.picture, width, OG_HEIGHT, {
      fit: 'cover',
      fade: { from: 0, to: PICTURE_FADE },
    }),
  ]);
  if (!src) return undefined;
  return {
    layers: [
      ...(backdrop
        ? [
            el('img', {
              src: backdrop,
              width: OG_WIDTH,
              height: OG_HEIGHT,
              style: { position: 'absolute', left: 0, top: 0, opacity: 0.7 },
            }),
          ]
        : []),
      el('img', {
        key: 'cover',
        src,
        width,
        height: OG_HEIGHT,
        style: { position: 'absolute', left: OG_WIDTH - width, top: 0 },
      }),
    ],
    bright: shown.analysis.coverBright,
  };
}

/** A field of the accent where the picture would be, dissolving the same way. */
export function accentCover(accent: ImageAccent): OgCoverGround {
  return {
    layers: [
      accentField(accent, PICTURE_MAX, OG_HEIGHT, PICTURE_FADE, {
        position: 'absolute',
        left: OG_WIDTH - PICTURE_MAX,
        top: 0,
      }),
    ],
    // The field under the words at its lightest.
    bright: Math.max(
      ...vividPlate(accent).stops.map((stop) => relativeLuminance(stop)),
    ),
  };
}

export interface OgCoverShade {
  /** White words on the shade; a chip is darker than it, never lighter. */
  palette: OgPalette;
  /** The shade itself, laid over the ground. */
  shade: OgNode;
  /** The words, each with its halo, laid over the shade. */
  words: (...nodes: OgNode[]) => OgNode;
}

/**
 * The shade the words sit on, just deep enough for white type wherever the
 * ground behind them is lightest.
 */
export function coverShade(
  accent: ImageAccent,
  bright: number,
  palette: OgPalette,
): OgCoverShade {
  const scrim = coverScrim(accent, bright, SHADE_MIN);
  const chip = blendHex('#000000', scrim.field, 0.3);
  const whole = { left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT };
  return {
    palette: {
      ...palette,
      dark: true,
      text: WHITE,
      muted: scrim.muted,
      accent: WHITE,
      chip: {
        background: chip,
        stops: [chip],
        text: WHITE,
        muted: scrim.muted,
      },
    },
    shade: el('div', {
      style: {
        ...place(whole),
        backgroundImage: `linear-gradient(90deg, ${withAlpha(scrim.color, scrim.alpha)} 0%, ${easedShadeStops(scrim.color, scrim.alpha, SHADE_SOLID, SHADE_END)})`,
      },
    }),
    // Every word inherits the halo; the plates of chips cover theirs.
    words: (...nodes) =>
      el(
        'div',
        {
          style: {
            ...place(whole),
            textShadow: HALO.map(
              ({ blur, alpha }) =>
                `0 0 ${blur}px ${withAlpha(scrim.color, alpha)}`,
            ).join(', '),
          },
        },
        ...nodes,
      ),
  };
}
