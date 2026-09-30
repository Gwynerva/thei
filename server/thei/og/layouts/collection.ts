import { frame } from '../blocks';
import { SAFE } from '../geometry';
import { pictureField } from '../palette';
import { pictureBox } from '../picture';
import { textColumn, type OgLayout } from './common';

/** Where the fanned pictures lie, back to front. */
const FAN = [
  { left: 596, top: 168, size: 250, angle: -14 },
  { left: 708, top: 128, size: 280, angle: -3 },
  { left: 836, top: 150, size: 296, angle: 9 },
];

/**
 * K: a listing — the showcase, the CV, the pages, a search preset — as a
 * fan of the pictures of what it lists, beside its name and how many there
 * are.
 */
export const collection: OgLayout = async (input) => {
  const { content, palette, tiles } = input;
  const shown = tiles.slice(0, FAN.length);
  // With fewer pictures, the fan keeps its front positions. The first item
  // of the listing lies in front, so it is drawn last.
  const places = FAN.slice(FAN.length - shown.length);
  const fan = await Promise.all(
    shown.map((tile, index) => {
      const place = places[places.length - 1 - index]!;
      return pictureBox(tile, {
        width: place.size,
        height: place.size,
        field: pictureField(tile.analysis.accent ?? content.accent, true),
        backdrop: 'field',
        inset: 0.12,
        crop: 'loose',
        radius: Math.round(place.size * 0.15),
        key: `tile:${index}`,
        style: {
          position: 'absolute',
          left: place.left,
          top: place.top,
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.35)',
          transform: `rotate(${place.angle}deg)`,
        },
      });
    }),
  );
  const width = FAN[0]!.left - 40 - SAFE.left;
  const text = await textColumn(
    input,
    { left: SAFE.left, top: SAFE.top, width, height: SAFE.height },
    { sizes: [72, 64, 56, 50, 44, 38] },
  );
  return {
    node: frame(palette, { x: 950, y: 315 }, ...fan.reverse(), ...text.nodes),
    stacks: { text: text.fitted },
  };
};
