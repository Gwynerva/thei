import {
  solveStack,
  type OgFittedItem,
  type OgFittedRow,
  type OgFittedStack,
  type OgFittedText,
  type OgStackItem,
  type OgStackPlan,
  type OgTextItem,
  textWidth,
} from './fit';
import { measureStack, ogTextStyle } from './measure';
import { el, type OgNode } from './render';

/** How a stack draws its texts and blocks; rows draw themselves. */
export interface OgStackPainter {
  text: (item: OgTextItem, style: Record<string, unknown>) => OgNode;
  block?: (key: string, height: number) => OgNode;
}

export interface OgStackRegion {
  left: number;
  top: number;
  /** Where the group sits inside its region; centred unless told otherwise. */
  justify?: 'center' | 'flex-start' | 'flex-end';
}

/** Measures a stack and solves it: everything a layout needs to draw it. */
export async function fitStack(plan: OgStackPlan): Promise<OgFittedStack> {
  return solveStack(plan, await measureStack(plan));
}

function drawRow(
  item: Extract<OgStackItem, { kind: 'row' }>,
  fitted: OgFittedRow,
): OgNode {
  return el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        height: item.height,
        gap: item.gap,
      },
    },
    // The width goes on the item itself: satori ends a label that does not
    // fit with an ellipsis only when its own box is too narrow, and merely
    // cuts it off when a wrapper is.
    ...item.items.slice(0, fitted.shown).map((entry, index) => ({
      ...entry.node,
      props: {
        ...entry.node.props,
        style: {
          ...(entry.node.props.style as Record<string, unknown>),
          flexShrink: 0,
          width: fitted.widths[index],
        },
      },
    })),
    ...(fitted.plus && item.plus ? [item.plus(fitted.plus)] : []),
  );
}

/**
 * The fitted stack as a column, placed in its region. The column is exactly
 * as tall as the region and centres its content, which is how every layout
 * keeps the substance of a card in the middle of its space whatever amount of
 * it survived. A centred stack also lines every item up down its middle.
 */
export function drawStack(
  plan: OgStackPlan,
  fitted: OgFittedStack,
  region: OgStackRegion,
  painter: OgStackPainter,
  key = 'stack',
): OgNode {
  const items = new Map(plan.items.map((item) => [item.key, item]));
  const centred = plan.align === 'center';
  const textNode = (item: OgTextItem, fitted: OgFittedText) => {
    const width = textWidth(plan, item);
    const text = painter.text(item, {
      ...ogTextStyle(item, fitted.size, width, fitted),
      // Satori aligns the lines of a text with several, and leaves one line
      // to its box: a centred text shrinks to its lines, no wider than the
      // column, and its row centres it.
      ...(centred
        ? { textAlign: 'center', width: undefined, maxWidth: width }
        : {}),
    });
    if (!item.lead) return text;
    return el(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: item.lead.gap,
          width: plan.width,
        },
      },
      painter.block?.(item.lead.key, item.lead.height) ??
        el('div', {
          style: {
            display: 'flex',
            width: item.lead.width,
            height: item.lead.height,
          },
        }),
      text,
    );
  };
  return el(
    'div',
    {
      key,
      style: {
        display: 'flex',
        flexDirection: 'column',
        position: 'absolute',
        left: region.left,
        top: region.top,
        width: plan.width,
        height: plan.height,
        justifyContent: region.justify ?? 'center',
      },
    },
    el(
      'div',
      {
        key: `${key}:group`,
        style: { display: 'flex', flexDirection: 'column', width: plan.width },
      },
      ...fitted.order.map(({ key: itemKey, gapBefore }) => {
        const item = items.get(itemKey)!;
        const result = fitted.items.get(itemKey) as OgFittedItem;
        const node =
          item.kind === 'text'
            ? textNode(item, result as OgFittedText)
            : item.kind === 'row'
              ? drawRow(item, result as OgFittedRow)
              : (painter.block?.(item.key, item.height) ??
                el('div', { style: { display: 'flex', height: item.height } }));
        return el(
          'div',
          {
            key: `${key}:${itemKey}`,
            // A text keeps the height it lays out at, so tests can compare
            // it with the prediction; everything else is told its height.
            style: {
              display: 'flex',
              flexShrink: 0,
              marginTop: gapBefore,
              ...(centred ? { justifyContent: 'center' } : {}),
              ...(item.kind === 'text' ? {} : { height: result.height }),
            },
          },
          node,
        );
      }),
    ),
  );
}
