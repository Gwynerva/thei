import { chip, frame, label, place, signature } from '../blocks';
import { ROW, SAFE, TYPE } from '../geometry';
import { el } from '../render';
import { textColumn, type OgLayout } from './common';

const CHART = { left: SAFE.left, top: 380, width: SAFE.width, height: 150 };
const LABELS_TOP = CHART.top + CHART.height + 10;

/**
 * I: a life as a chart. How much was recorded each year, as bars in the
 * accent's shades along the bottom of the card, from the first year to the
 * last; above them the name of the page and what it holds.
 */
export const life: OgLayout = async (input) => {
  const { content, palette } = input;
  const values = content.histogram?.values ?? [];
  const most = Math.max(1, ...values);
  const gap = values.length > 40 ? 3 : values.length > 20 ? 6 : 10;
  const barWidth = values.length
    ? (CHART.width - gap * (values.length - 1)) / values.length
    : 0;
  const top = SAFE.top + ROW.chip + 24;
  const text = await textColumn(
    input,
    { left: SAFE.left, top, width: SAFE.width, height: CHART.top - 28 - top },
    {
      sizes: [72, 64, 56, 50, 44, 38],
      maxLines: 2,
      chips: false,
      signature: false,
    },
  );
  const kind = content.chips[0];
  return {
    node: frame(
      palette,
      { x: 1200, y: 0 },
      el(
        'div',
        {
          style: {
            ...place({
              left: SAFE.left,
              top: SAFE.top,
              width: SAFE.width,
              height: ROW.chip,
            }),
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
          },
        },
        ...(kind ? [chip(kind, palette.chip)] : []),
        await signature(content.site, palette, SAFE.width / 2, {
          domain: false,
          shrink: true,
        }),
      ),
      ...text.nodes,
      el(
        'div',
        {
          key: 'essential:chart',
          style: {
            ...place(CHART),
            alignItems: 'flex-end',
            gap,
          },
        },
        ...values.map((value) =>
          el('div', {
            style: {
              display: 'flex',
              flexShrink: 0,
              width: barWidth,
              height: value ? Math.max(6, (value / most) * CHART.height) : 3,
              borderRadius: `${Math.min(8, barWidth / 2)}px ${Math.min(8, barWidth / 2)}px 2px 2px`,
              backgroundImage: value
                ? `linear-gradient(180deg, ${palette.bars[0]} 0%, ${palette.bars[1]} 100%)`
                : undefined,
              background: value ? undefined : palette.surface,
            },
          }),
        ),
      ),
      el(
        'div',
        {
          style: {
            ...place({
              left: SAFE.left,
              top: LABELS_TOP,
              width: SAFE.width,
              height: 30,
            }),
            justifyContent: 'space-between',
            color: palette.muted,
            fontSize: TYPE.meta,
            fontWeight: 600,
          },
        },
        label(content.histogram?.first ?? ''),
        label(content.histogram?.last ?? ''),
      ),
    ),
    stacks: { text: text.fitted },
  };
};
