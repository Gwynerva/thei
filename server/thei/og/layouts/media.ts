import { frame } from '../blocks';
import {
  accentCover,
  COVER_MARK_CENTRE,
  COVER_WORDS_WIDTH,
  coverShade,
  pictureCover,
} from '../cover';
import { OG_HEIGHT, SAFE } from '../geometry';
import { ogIcon } from '../icons';
import { el } from '../render';
import { kindIcon, textColumn, type OgLayout } from './common';

const ICON = 340;

/**
 * A section or an event, laid the way a project's card is (`cover.ts`): its
 * banner, or else the first picture of its body, is the card's cover, and a
 * thing without one has the picture the site draws for it there instead —
 * the same picture its cards in the feed show. Only a picture that cannot be
 * read leaves a field of the accent, with the kind's mark on it.
 */
export const media: OgLayout = async (input) => {
  const { content, palette, picture } = input;
  const accent = picture?.analysis.accent ?? content.accent;
  const cover = picture && (await pictureCover(picture));
  const ground = cover ?? accentCover(accent);
  const shade = coverShade(accent, ground.bright, palette);

  const marks = cover
    ? []
    : [
        el(
          'div',
          {
            key: 'art',
            style: {
              display: 'flex',
              position: 'absolute',
              left: COVER_MARK_CENTRE - ICON / 2,
              top: (OG_HEIGHT - ICON) / 2,
            },
          },
          ogIcon(kindIcon(content), '#ffffff', ICON, { opacity: 0.9 }),
        ),
      ];

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
