import { frame } from '../blocks';
import { OG_WIDTH, SAFE } from '../geometry';
import { iconImage } from '../picture';
import { fallbackArt, textColumn, type OgLayout } from './common';

const ICON = 148;
const WIDTH = 900;

/**
 * A tag: a field of its colour and everything down the middle — its icon,
 * its own or the one the site draws, its name, what it is about and how
 * much it holds — the one card that stands centred, as a tag is a thread
 * rather than a thing.
 */
export const tag: OgLayout = async (input) => {
  const { content, palette, picture } = input;
  const icon =
    (picture &&
      (await iconImage(picture, ICON, {
        shadow: true,
        key: 'essential:icon',
      }))) ??
    fallbackArt(content, palette, ICON, ICON, { borderRadius: ICON * 0.22 });
  const text = await textColumn(
    input,
    {
      left: (OG_WIDTH - WIDTH) / 2,
      top: SAFE.top,
      width: WIDTH,
      height: SAFE.height,
    },
    {
      sizes: [76, 68, 60, 52, 46, 40],
      maxLines: 2,
      align: 'center',
      crest: { node: icon, height: ICON, gap: 26 },
    },
  );
  return {
    node: frame(palette, { x: OG_WIDTH / 2, y: 0 }, ...text.nodes),
    stacks: { text: text.fitted },
  };
};
