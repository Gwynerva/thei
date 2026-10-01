import { frame, place } from '../blocks';
import { SAFE } from '../geometry';
import { ogIcon } from '../icons';
import { el } from '../render';
import { kindIcon, textColumn, type OgLayout } from './common';

/**
 * Type on a field of colour, with the icon of what the page is as a large
 * faint watermark: the rewind, and a page of the site's own with nothing yet
 * to chart or to fan out.
 */
export const poster: OgLayout = async (input) => {
  const { content, palette } = input;
  const text = await textColumn(
    input,
    { left: SAFE.left, top: SAFE.top, width: 900, height: SAFE.height },
    { sizes: [88, 78, 68, 60, 52, 46, 40], maxLines: 4 },
  );
  return {
    node: frame(
      palette,
      { x: 1100, y: 0 },
      el(
        'div',
        {
          style: {
            ...place({ left: 700, top: 20, width: 620, height: 620 }),
            transform: 'rotate(-12deg)',
            opacity: 0.13,
          },
        },
        ogIcon(kindIcon(content), palette.text, 620),
      ),
      ...text.nodes,
    ),
    stacks: { text: text.fitted },
  };
};
