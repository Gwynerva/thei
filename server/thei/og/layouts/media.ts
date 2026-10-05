import { frame } from '../blocks';
import {
  accentCover,
  COVER_WORDS_WIDTH,
  coverShade,
  pictureCover,
} from '../cover';
import { OG_HEIGHT, OG_WIDTH, SAFE } from '../geometry';
import { ogIcon } from '../icons';
import { iconImage } from '../picture';
import { el } from '../render';
import { kindIcon, textColumn, type OgLayout } from './common';

/** Where a picture shown whole sits: in the part of the card left clear. */
const CENTRE = OG_WIDTH - Math.round((OG_WIDTH / 2) * 0.38);
const ICON = 340;

/**
 * A section or an event, as their cards in a feed show them, laid the way a
 * project's card is (`cover.ts`). A photograph — its banner, or else the
 * first picture of its body — is the card's cover. An icon or a see-through
 * drawing stands whole on a field of its accent, and a thing without a
 * picture has that field with its kind's mark.
 */
export const media: OgLayout = async (input) => {
  const { content, palette, picture } = input;
  const accent = picture?.analysis.accent ?? content.accent;
  const photo =
    picture && !picture.analysis.iconLike
      ? await pictureCover(picture)
      : undefined;
  const ground = photo ?? accentCover(accent);
  const shade = coverShade(accent, ground.bright, palette);

  const marks = [];
  if (!photo) {
    const whole =
      picture && (await iconImage(picture, ICON, { shadow: true, key: 'art' }));
    marks.push(
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
    { ...input, palette: shade.palette },
    {
      left: SAFE.left,
      top: SAFE.top,
      width: COVER_WORDS_WIDTH,
      height: SAFE.height,
    },
    { sizes: [64, 58, 52, 46, 40, 36] },
  );

  return {
    node: frame(
      palette,
      undefined,
      ...ground.layers,
      shade.shade,
      ...marks,
      shade.words(...text.nodes),
    ),
    stacks: { text: text.fitted },
  };
};
