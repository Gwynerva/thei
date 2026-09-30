import { cloudOutlinePath } from '#layers/thei/shared/cloud-outline';
import { frame, label, place } from '../blocks';
import { SAFE } from '../geometry';
import type { OgPlate } from '../palette';
import { pictureBox } from '../picture';
import { el, type OgNode } from '../render';
import { textColumn, type OgLayout } from './common';

const LEAF = {
  left: SAFE.left,
  top: SAFE.top,
  width: 340,
  height: SAFE.height,
};
/** A photograph pinned to the leaf, in the shape photographs mostly are. */
const PIN = { width: 264, height: 176 };
/** The leaf is larger than a card in a feed; so are the cloud's bumps. */
const CLOUD_SCALE = 1.6;

function line(text: string, size: number, color: string, weight = 700): OgNode {
  return label(text, {
    color,
    fontSize: size,
    fontWeight: weight,
    lineHeight: 1.05,
    textAlign: 'center',
    maxWidth: LEAF.width - 40,
  });
}

/**
 * The leaf's outline: the cloud its entry's card has in the feeds, filled
 * like the plate. A box in satori is only ever a rectangle, so the cloud is
 * a picture behind the leaf's lines, its gradient run along the same line
 * the plate's CSS gradient takes.
 */
function cloudLeaf(plate: OgPlate, seed: string): OgNode {
  const { width, height } = LEAF;
  const path = cloudOutlinePath(width, height, seed, { scale: CLOUD_SCALE });
  const [from, to = from] = plate.stops;
  // CSS measures the angle clockwise from up, and runs the gradient through
  // the centre just far enough to reach the far corners.
  const angle = ((plate.angle ?? 180) * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const line = [
    width / 2 - dx * half,
    height / 2 - dy * half,
    width / 2 + dx * half,
    height / 2 + dy * half,
  ].map((value) => Math.round(value * 10) / 10);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><linearGradient id="leaf" gradientUnits="userSpaceOnUse" x1="${line[0]}" y1="${line[1]}" x2="${line[2]}" y2="${line[3]}">`,
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>`,
    `</linearGradient></defs><path d="${path}" fill="url(#leaf)"/></svg>`,
  ].join('');
  return el('img', {
    src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    width,
    height,
    style: { position: 'absolute', left: 0, top: 0 },
  });
}

/**
 * D: the day is the thing — a diary entry's, the one kind of card called by
 * nothing else. A leaf of a tear-off calendar in the accent, outlined as a
 * cloud — weekday, the day in large figures, the month, the year — and
 * beside it the opening words of the entry. A picture the entry opens with
 * is pinned to the corner of the leaf.
 */
export const calendar: OgLayout = async (input) => {
  const { content, palette, picture } = input;
  const plate = palette.plate;
  const date = content.date;
  const pinned = picture?.picture.type === 'file';
  // A pinned photograph takes the leaf's lower part; the day gives it room.
  const leafLines = date
    ? (
        [
          [date.weekday, 30, plate.muted, 600],
          [date.day, pinned ? 168 : 200, plate.text, 700],
          [date.month, 42, plate.text, 700],
          [date.year, 32, plate.muted, 600],
        ] as const
      )
        // A part the fonts cannot draw has been emptied; its line goes.
        .filter(([text]) => text)
        .map(([text, size, color, weight]) => line(text, size, color, weight))
    : [];

  const pin =
    picture && pinned
      ? await pictureBox(picture, {
          ...PIN,
          field: palette.surface,
          backdrop: 'blur',
          inset: 0.08,
          radius: 22,
          style: {
            position: 'absolute',
            left: LEAF.left + LEAF.width - PIN.width + 44,
            top: LEAF.top + LEAF.height - PIN.height + 26,
            border: `8px solid ${palette.stops[0]}`,
            transform: 'rotate(4deg)',
          },
        })
      : undefined;

  const left = LEAF.left + LEAF.width + (pin ? 100 : 72);
  const text = await textColumn(
    input,
    { left, top: SAFE.top, width: SAFE.right - left, height: SAFE.height },
    { sizes: [64, 58, 52, 46, 40, 36], quote: true },
  );

  return {
    node: frame(
      palette,
      { x: 1180, y: 20 },
      el(
        'div',
        {
          key: 'essential:leaf',
          style: {
            ...place(LEAF),
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            // The pinned picture covers the leaf's lower part.
            paddingBottom: pin ? 150 : 0,
          },
        },
        cloudLeaf(plate, content.seed),
        ...leafLines,
      ),
      ...(pin ? [pin] : []),
      ...text.nodes,
    ),
    stacks: { text: text.fitted },
  };
};
