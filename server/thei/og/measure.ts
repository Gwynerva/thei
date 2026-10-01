import { OG_FONT_FAMILY } from './font-set';
import {
  digitsOf,
  plusKey,
  textKey,
  textWidth,
  type OgFittedText,
  type OgMeasurements,
  type OgStackPlan,
  type OgTextItem,
} from './fit';
import { OG_WIDTH } from './geometry';
import { el, renderOgSvg, type OgNode } from './render';

/**
 * How a text of the stack is set — one function for measuring and drawing,
 * so what was measured is exactly what is drawn.
 *
 * A text that keeps its words whole (a title) breaks one only when it must:
 * at the smallest size, with a word wider than the column, which would
 * otherwise run off the card. Such a text is not balanced either — satori
 * balances by narrowing the lines, and a narrower line is exactly where a
 * breakable word gets cut. Other texts may always break a word.
 */
export function ogTextStyle(
  item: OgTextItem,
  size: number,
  width: number,
  fitted?: Pick<OgFittedText, 'clamped' | 'lines' | 'breakWords'>,
): Record<string, unknown> {
  const breaking = !item.keepWords || Boolean(fitted?.breakWords);
  return {
    display: 'block',
    width,
    fontSize: size,
    lineHeight: item.lineHeight,
    fontWeight: item.weight,
    fontStyle: item.italic ? 'italic' : 'normal',
    wordBreak: breaking ? 'break-word' : 'normal',
    // Only text of several words is balanced: there is nothing to balance in
    // one, and satori 0.33 never returns from balancing a single character
    // that may break.
    ...(item.balance && !breaking && /\S\s+\S/.test(item.text)
      ? { textWrap: 'balance' }
      : {}),
    ...(fitted?.clamped ? { lineClamp: fitted.lines } : {}),
  };
}

/** The words of a text a line could not be broken inside of, widest first. */
function unbreakableWords(text: string): string[] {
  // A no-break space binds its words into one that cannot be wrapped either.
  return [...new Set(text.split(/[^\S\u00A0]+/).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);
}

interface ProbeRequest {
  key: string;
  node: OgNode;
}

/**
 * Lays out every request once, each on a line of its own and free to be as
 * wide as it wants, and reports the box satori gave it.
 */
export async function probe(
  requests: ProbeRequest[],
): Promise<Map<string, { width: number; height: number }>> {
  const boxes = new Map<string, { width: number; height: number }>();
  if (!requests.length) return boxes;
  const keys = new Set(requests.map(({ key }) => `probe:${key}`));
  await renderOgSvg(
    el(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          fontFamily: OG_FONT_FAMILY,
        },
      },
      ...requests.map(({ key, node }) =>
        el(
          'div',
          { style: { display: 'flex', flexShrink: 0 } },
          {
            ...node,
            key: `probe:${key}`,
            props: {
              ...node.props,
              style: {
                ...(node.props.style as Record<string, unknown>),
                flexShrink: 0,
              },
            },
          },
        ),
      ),
    ),
    {
      width: OG_WIDTH,
      onNode: (node) => {
        if (node.key && keys.has(node.key))
          boxes.set(node.key.slice('probe:'.length), {
            width: node.width,
            height: node.height,
          });
      },
    },
  );
  return boxes;
}

/**
 * Everything the solver needs to know about a stack, from one render: every
 * text at every size it may take, the widest words it holds, and the width of
 * every item a row may show.
 */
export async function measureStack(plan: OgStackPlan): Promise<OgMeasurements> {
  const requests: ProbeRequest[] = [];
  for (const item of plan.items) {
    if (item.kind === 'text') {
      const width = textWidth(plan, item);
      for (const size of item.sizes) {
        requests.push({
          key: textKey(item.key, size),
          node: el('div', { style: ogTextStyle(item, size, width) }, item.text),
        });
        // A title is also measured as it is set when it has to break a word,
        // which it is at its smallest size if a word is wider than the line.
        if (item.keepWords)
          requests.push({
            key: `${textKey(item.key, size)}!break`,
            node: el(
              'div',
              {
                style: ogTextStyle(item, size, width, {
                  breakWords: true,
                  clamped: false,
                  lines: 0,
                }),
              },
              item.text,
            ),
          });
        // One line of the same type. Not balanced: satori's balancing never
        // settles on a text that fills no line, and a line is a line anyway.
        requests.push({
          key: `${textKey(item.key, size)}#line`,
          node: el(
            'div',
            {
              style: {
                ...ogTextStyle(item, size, width),
                textWrap: 'wrap',
              },
            },
            'x',
          ),
        });
        unbreakableWords(item.text).forEach((word, index) =>
          requests.push({
            key: `${textKey(item.key, size)}#${index}`,
            node: el(
              'div',
              {
                style: {
                  display: 'flex',
                  whiteSpace: 'nowrap',
                  fontSize: size,
                  fontWeight: item.weight,
                  fontStyle: item.italic ? 'italic' : 'normal',
                },
              },
              word,
            ),
          }),
        );
      }
    } else if (item.kind === 'row') {
      for (const entry of item.items)
        requests.push({ key: `${item.key}/${entry.key}`, node: entry.node });
      if (item.plus) {
        const most = item.items.length + (item.hiddenCount ?? 0);
        for (let digits = 1; digits <= digitsOf(most); digits++)
          requests.push({
            key: plusKey(item.key, digits),
            // Figures are tabular, so the widest count of a length is any.
            node: item.plus(Number('9'.repeat(digits))),
          });
      }
    }
  }

  const boxes = await probe(requests);
  const measurements: OgMeasurements = {
    textHeight: new Map(),
    wordWidth: new Map(),
    lineHeight: new Map(),
    itemWidth: new Map(),
  };
  for (const item of plan.items) {
    if (item.kind === 'text')
      for (const size of item.sizes) {
        const key = textKey(item.key, size);
        measurements.textHeight.set(key, boxes.get(key)?.height ?? 0);
        const broken = boxes.get(`${key}!break`);
        if (broken) measurements.textHeight.set(`${key}!break`, broken.height);
        measurements.lineHeight.set(key, boxes.get(`${key}#line`)?.height ?? 0);
        let widest = 0;
        for (let index = 0; index < 5; index++)
          widest = Math.max(widest, boxes.get(`${key}#${index}`)?.width ?? 0);
        measurements.wordWidth.set(key, widest);
      }
    else if (item.kind === 'row') {
      for (const entry of item.items) {
        const key = `${item.key}/${entry.key}`;
        measurements.itemWidth.set(key, boxes.get(key)?.width ?? 0);
      }
      for (const [key, box] of boxes)
        if (key.startsWith(`${item.key}/+`))
          measurements.itemWidth.set(key, box.width);
    }
  }
  return measurements;
}
