import { accentField, frame } from '../blocks';
import { pictureDataUri } from '../artwork';
import { OG_HEIGHT, SAFE } from '../geometry';
import { ogIcon } from '../icons';
import { iconImage } from '../picture';
import { el, type OgNode } from '../render';
import { kindIcon, textColumn, type OgLayout } from './common';

/** The right half is the picture's; the words keep clear of it. */
const HALF = 600;
const TEXT_RIGHT = HALF - 32;
/** How much of the half, from its left edge, dissolves into the card. */
const FADE = 0.45;
/** Where a picture shown whole sits: in the part of the half left clear. */
const CENTRE = HALF + Math.round(HALF * 0.62);
const ICON = 340;

/**
 * A section or an event, as their cards in a feed show them: the
 * right half of the card is their first picture, dissolving leftwards into
 * a plain dark field that holds the words. A photograph fills the half; an
 * icon or a see-through drawing stands whole on a field of its accent; a
 * thing without a picture has that field with its kind's mark.
 */
export const media: OgLayout = async (input) => {
  const { content, palette, picture } = input;
  const half = { position: 'absolute', left: HALF, top: 0 };
  const layers: OgNode[] = [];

  if (picture && !picture.analysis.iconLike) {
    const src = await pictureDataUri(picture.picture, HALF, OG_HEIGHT, {
      fit: 'cover',
      fade: { from: 0, to: FADE },
    });
    if (src)
      layers.push(
        el('img', {
          key: 'art',
          src,
          width: HALF,
          height: OG_HEIGHT,
          style: half,
        }),
      );
  }
  if (!layers.length) {
    const accent = picture?.analysis.accent ?? content.accent;
    const whole =
      picture && (await iconImage(picture, ICON, { shadow: true, key: 'art' }));
    layers.push(
      accentField(accent, HALF, OG_HEIGHT, FADE, half),
      el(
        'div',
        {
          style: {
            display: 'flex',
            position: 'absolute',
            left: CENTRE - ICON / 2,
            top: (OG_HEIGHT - ICON) / 2,
          },
        },
        whole ?? ogIcon(kindIcon(content), '#ffffff', ICON, { opacity: 0.9 }),
      ),
    );
  }

  const text = await textColumn(
    input,
    {
      left: SAFE.left,
      top: SAFE.top,
      width: TEXT_RIGHT - SAFE.left,
      height: SAFE.height,
    },
    { sizes: [64, 58, 52, 46, 40, 36] },
  );

  return {
    node: frame(palette, { x: 0, y: OG_HEIGHT }, ...layers, ...text.nodes),
    stacks: { text: text.fitted },
  };
};
