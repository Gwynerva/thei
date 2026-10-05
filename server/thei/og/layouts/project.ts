import { frame } from '../blocks';
import {
  accentCover,
  COVER_WORDS_WIDTH,
  coverShade,
  pictureCover,
} from '../cover';
import { SAFE } from '../geometry';
import { iconImage } from '../picture';
import { fallbackArt, textColumn, type OgLayout } from './common';

const ICON = 132;

/**
 * A project, the way its page's header shows it: the banner as the card's
 * cover (`cover.ts`) and the icon beside the title with nothing around it. A
 * project without a banner has a field of its accent there instead, as its
 * page does.
 */
export const project: OgLayout = async (input) => {
  const { content, palette, picture, banner } = input;
  const accent = banner?.analysis.accent ?? content.accent;
  const ground =
    (banner && (await pictureCover(banner))) ?? accentCover(accent);
  const shade = coverShade(accent, ground.bright, palette);

  const icon =
    (picture && (await iconImage(picture, ICON, { key: 'essential:icon' }))) ??
    fallbackArt(content, palette, ICON, ICON, { borderRadius: ICON * 0.22 });
  const text = await textColumn(
    { ...input, palette: shade.palette },
    {
      left: SAFE.left,
      top: SAFE.top,
      width: COVER_WORDS_WIDTH,
      height: SAFE.height,
    },
    {
      sizes: [72, 64, 58, 52, 46, 40],
      lead: { node: icon, size: ICON, gap: 28 },
    },
  );

  return {
    node: frame(
      palette,
      undefined,
      ...ground.layers,
      shade.shade,
      shade.words(...text.nodes),
    ),
    stacks: { text: text.fitted },
  };
};
