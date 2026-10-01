import {
  blendHex,
  relativeLuminance,
  withAlpha,
} from '#layers/thei/shared/oklch';
import { accentField, frame, place } from '../blocks';
import { easedShadeStops, pictureDataUri } from '../artwork';
import { OG_HEIGHT, OG_WIDTH, SAFE } from '../geometry';
import { coverScrim, vividPlate, type OgPalette } from '../palette';
import { iconImage } from '../picture';
import { el, type OgNode } from '../render';
import { fallbackArt, textColumn, type OgLayout } from './common';

const WHITE = '#ffffff';
/** The column the header's words take: two thirds, as on the page. */
const TEXT_WIDTH = 700;
/** The banner's widest; a wider one loses its sides to fit. */
const BANNER_MAX = 1000;
/** How much of the banner, from its left edge, dissolves into the card. */
const BANNER_FADE = 0.55;
const ICON = 132;
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

/**
 * A project, the way its page's header shows it: the banner at full height
 * on the right in its own proportions, dissolving leftwards into a blurred
 * copy of itself that fills the card, a shade under the words, and the icon
 * beside the title with nothing around it. A project without a banner has a
 * field of its accent there instead, as its page does.
 */
export const project: OgLayout = async (input) => {
  const { content, palette, picture, banner } = input;
  const accent = banner?.analysis.accent ?? content.accent;

  const layers: OgNode[] = [];
  let bright: number;
  if (banner) {
    const backdrop = await pictureDataUri(banner.picture, 300, 158, {
      fit: 'cover',
      blur: 6,
    });
    if (backdrop)
      layers.push(
        el('img', {
          src: backdrop,
          width: OG_WIDTH,
          height: OG_HEIGHT,
          style: {
            position: 'absolute',
            left: 0,
            top: 0,
            opacity: 0.7,
          },
        }),
      );
    const width = Math.min(
      BANNER_MAX,
      Math.round(OG_HEIGHT * banner.analysis.aspect),
    );
    const src = await pictureDataUri(banner.picture, width, OG_HEIGHT, {
      fit: 'cover',
      fade: { from: 0, to: BANNER_FADE },
    });
    if (src)
      layers.push(
        el('img', {
          key: 'banner',
          src,
          width,
          height: OG_HEIGHT,
          style: { position: 'absolute', left: OG_WIDTH - width, top: 0 },
        }),
      );
    bright = banner.analysis.coverBright;
  } else {
    layers.push(
      accentField(accent, BANNER_MAX, OG_HEIGHT, BANNER_FADE, {
        position: 'absolute',
        left: OG_WIDTH - BANNER_MAX,
        top: 0,
      }),
    );
    // The field under the words at its lightest.
    bright = Math.max(
      ...vividPlate(accent).stops.map((stop) => relativeLuminance(stop)),
    );
  }

  // White words, on a shade just deep enough for them wherever the picture
  // behind is lightest; a chip is darker than the shade, never lighter.
  const scrim = coverScrim(accent, bright, SHADE_MIN);
  const onShade: OgPalette = {
    ...palette,
    dark: true,
    text: WHITE,
    muted: scrim.muted,
    accent: WHITE,
    chip: {
      background: blendHex('#000000', scrim.field, 0.3),
      stops: [blendHex('#000000', scrim.field, 0.3)],
      text: WHITE,
      muted: scrim.muted,
    },
  };

  const icon =
    (picture && (await iconImage(picture, ICON, { key: 'essential:icon' }))) ??
    fallbackArt(content, palette, ICON, ICON, { borderRadius: ICON * 0.22 });
  const text = await textColumn(
    { ...input, palette: onShade },
    { left: SAFE.left, top: SAFE.top, width: TEXT_WIDTH, height: SAFE.height },
    {
      sizes: [72, 64, 58, 52, 46, 40],
      lead: { node: icon, size: ICON, gap: 28 },
    },
  );

  return {
    node: frame(
      palette,
      undefined,
      ...layers,
      el('div', {
        style: {
          ...place({ left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT }),
          backgroundImage: `linear-gradient(90deg, ${withAlpha(scrim.color, scrim.alpha)} 0%, ${easedShadeStops(scrim.color, scrim.alpha, SHADE_SOLID, SHADE_END)})`,
        },
      }),
      // Every word inherits the halo; the plates of chips cover theirs.
      el(
        'div',
        {
          style: {
            ...place({ left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT }),
            textShadow: HALO.map(
              ({ blur, alpha }) =>
                `0 0 ${blur}px ${withAlpha(scrim.color, alpha)}`,
            ).join(', '),
          },
        },
        ...text.nodes,
      ),
    ),
    stacks: { text: text.fitted },
  };
};
