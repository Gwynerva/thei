import { frame } from '../blocks';
import { OG_HEIGHT, SAFE } from '../geometry';
import { iconImage } from '../picture';
import { el } from '../render';
import { fallbackArt, textColumn, type OgLayout } from './common';

const ICON = 380;
const ICON_LEFT = SAFE.right - ICON + 24;

/**
 * A page: a field in its icon's colours, and the icon held up on the right
 * as the site shows it, with nothing around it. A page without an icon of
 * its own holds up the one the site draws for it.
 */
export const page: OgLayout = async (input) => {
  const { content, palette, picture } = input;
  const icon =
    (picture && (await iconImage(picture, ICON, { shadow: true }))) ??
    fallbackArt(content, palette, ICON, ICON, { borderRadius: ICON * 0.22 });
  const text = await textColumn(
    input,
    {
      left: SAFE.left,
      top: SAFE.top,
      width: ICON_LEFT - 64 - SAFE.left,
      height: SAFE.height,
    },
    { sizes: [84, 76, 68, 60, 52, 46, 40] },
  );
  return {
    node: frame(
      palette,
      { x: ICON_LEFT + ICON / 2, y: 0 },
      el(
        'div',
        {
          key: 'art',
          style: {
            display: 'flex',
            position: 'absolute',
            left: ICON_LEFT,
            top: (OG_HEIGHT - ICON) / 2,
          },
        },
        icon,
      ),
      ...text.nodes,
    ),
    stacks: { text: text.fitted },
  };
};
