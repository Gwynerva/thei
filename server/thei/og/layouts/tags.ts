import { frame, label, place, thumbnail } from '../blocks';
import { packCloud } from '../fit';
import { SAFE } from '../geometry';
import { ogIcon, OG_KIND_ICONS } from '../icons';
import { probe } from '../measure';
import type { OgTag } from '../model';
import { tagPlate, type OgPalette } from '../palette';
import { el, type OgNode } from '../render';
import { textColumn, type OgLayout } from './common';

const REGION = {
  left: 532,
  top: SAFE.top,
  width: SAFE.right - 532,
  height: SAFE.height,
};
const GAP = 12;
const PLUS_HEIGHT = 46;

/** The most used tags are set larger, as a cloud sets them. */
function tier(index: number) {
  if (index < 3) return { font: 30, height: 58, icon: 32 };
  if (index < 8) return { font: 26, height: 52, icon: 28 };
  return { font: 23, height: 46, icon: 26 };
}

async function tagChip(tag: OgTag, index: number, palette: OgPalette) {
  const size = tier(index);
  const plate = tagPlate(tag.accent, palette.dark);
  const picture = await thumbnail(tag.picture, size.icon, size.icon / 2);
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: size.height,
        padding: `0 ${Math.round(size.height * 0.36)}px 0 ${Math.round(size.height * 0.2)}px`,
        borderRadius: size.height / 2,
        background: plate.background,
        color: plate.text,
        fontSize: size.font,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
    },
    picture ?? ogIcon(OG_KIND_ICONS.tag, plate.text, size.icon),
    label(tag.title, { maxWidth: REGION.width - 160 }),
    ...(tag.count
      ? [
          el(
            'div',
            { style: { display: 'flex', color: plate.muted, fontWeight: 400 } },
            String(tag.count),
          ),
        ]
      : []),
  );
}

function plusChip(count: number, palette: OgPalette) {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        height: PLUS_HEIGHT,
        padding: '0 20px',
        borderRadius: PLUS_HEIGHT / 2,
        background: palette.chip.background,
        color: palette.chip.text,
        fontSize: 23,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      },
    },
    `+${count}`,
  );
}

/**
 * The tags as a cloud. The most used first and largest, each in its own
 * colour with its own icon — the Thei tag icon for one without — as many as
 * the right of the card holds, and a count of the rest.
 */
export const tags: OgLayout = async (input) => {
  const { content, palette } = input;
  const chips = await Promise.all(
    content.cloud.map((tag, index) => tagChip(tag, index, palette)),
  );
  const boxes = await probe([
    ...chips.map((node, index) => ({ key: `tag${index}`, node })),
    ...[1, 2, 3, 4].map((digits) => ({
      key: `plus${digits}`,
      node: plusChip(Number('9'.repeat(digits)), palette),
    })),
  ]);
  const packed = packCloud(
    chips.map((_, index) => ({
      width: boxes.get(`tag${index}`)?.width ?? 0,
      height: tier(index).height,
    })),
    {
      width: REGION.width,
      height: REGION.height,
      gap: GAP,
      rowGap: GAP,
      plusWidth: (count) =>
        boxes.get(`plus${String(count).length}`)?.width ?? 0,
      plusHeight: PLUS_HEIGHT,
      hiddenCount: Math.max(0, content.cloudTotal - content.cloud.length),
    },
  );
  const rows: OgNode[] = packed.rows.map((row, index) =>
    el(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: GAP } },
      ...row.map((item) => chips[item]!),
      ...(index === packed.rows.length - 1 && packed.plus
        ? [plusChip(packed.plus, palette)]
        : []),
    ),
  );
  const width = REGION.left - 48 - SAFE.left;
  const text = await textColumn(
    input,
    { left: SAFE.left, top: SAFE.top, width, height: SAFE.height },
    { sizes: [72, 64, 56, 50, 44, 38] },
  );
  return {
    node: frame(
      palette,
      { x: 1200, y: 630 },
      el(
        'div',
        {
          key: 'essential:cloud',
          style: {
            ...place(REGION),
            flexDirection: 'column',
            justifyContent: 'center',
            gap: GAP,
          },
        },
        ...rows,
      ),
      ...text.nodes,
    ),
    stacks: { text: text.fitted },
  };
};
