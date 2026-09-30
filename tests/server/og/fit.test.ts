import { describe, expect, it } from 'vitest';
import {
  packCloud,
  packRow,
  plusKey,
  solveStack,
  textKey,
  textWidth,
  type OgMeasurements,
  type OgStackPlan,
  type OgTextItem,
} from '../../../server/thei/og/fit';
import { el } from '../../../server/thei/og/render';

describe('packRow', () => {
  const plus = () => 40;

  it('shows everything that fits', () => {
    expect(packRow([100, 100], 10, 210, plus)).toEqual({ shown: 2, plus: 0 });
  });

  it('keeps room for the count of what did not fit', () => {
    // Three items of 100 need 320; the third gives way to "+1".
    expect(packRow([100, 100, 100], 10, 300, plus)).toEqual({
      shown: 2,
      plus: 1,
    });
  });

  it('counts items that were never offered', () => {
    expect(packRow([100], 10, 300, plus, 57)).toEqual({ shown: 1, plus: 57 });
  });

  it('drops the rest silently when there is nothing to count them with', () => {
    expect(packRow([100, 100, 100], 10, 250)).toEqual({ shown: 2, plus: 0 });
  });

  it('copes with nothing, with one huge item and with hundreds', () => {
    expect(packRow([], 10, 300, plus)).toEqual({ shown: 0, plus: 0 });
    expect(packRow([5000], 10, 300, plus)).toEqual({ shown: 0, plus: 1 });
    const many = packRow(Array(200).fill(50), 10, 500, plus);
    expect(many.shown).toBe(7);
    expect(many.shown + many.plus).toBe(200);
  });
});

/**
 * A stack whose texts are measured by arithmetic: each character is 0.5 em
 * wide, so a text of n characters at size s takes ceil(n·s/2 / width) lines.
 */
function measure(plan: OgStackPlan, rowWidths: Record<string, number> = {}) {
  const measurements: OgMeasurements = {
    textHeight: new Map(),
    wordWidth: new Map(),
    lineHeight: new Map(),
    itemWidth: new Map(),
  };
  for (const item of plan.items) {
    if (item.kind === 'text')
      for (const size of item.sizes) {
        const lines = Math.max(
          1,
          Math.ceil((item.text.length * size) / 2 / textWidth(plan, item)),
        );
        measurements.textHeight.set(
          textKey(item.key, size),
          lines * size * item.lineHeight,
        );
        const word = item.text
          .split(' ')
          .reduce((a, b) => (b.length > a.length ? b : a), '');
        measurements.wordWidth.set(
          textKey(item.key, size),
          (word.length * size) / 2,
        );
      }
    if (item.kind === 'row') {
      for (const entry of item.items)
        measurements.itemWidth.set(
          `${item.key}/${entry.key}`,
          rowWidths[entry.key] ?? 100,
        );
      for (let digits = 1; digits < 5; digits++)
        measurements.itemWidth.set(plusKey(item.key, digits), 30 + digits * 10);
    }
  }
  return measurements;
}

const title = (text: string, extra: Partial<OgTextItem> = {}): OgTextItem => ({
  kind: 'text',
  key: 'title',
  text,
  sizes: [80, 60, 40],
  lineHeight: 1,
  weight: 700,
  maxLines: 3,
  keepWords: true,
  required: true,
  gapBefore: 0,
  ...extra,
});

const summary = (text: string): OgTextItem => ({
  kind: 'text',
  key: 'summary',
  text,
  sizes: [20],
  lineHeight: 1,
  weight: 400,
  maxLines: 3,
  gapBefore: 10,
});

const tagRow = (count: number) => ({
  kind: 'row' as const,
  key: 'tags',
  height: 30,
  gap: 10,
  items: Array.from({ length: count }, (_, index) => ({
    key: `t${index}`,
    node: el('div', {}, `#${index}`),
  })),
  plus: (value: number) => el('div', {}, `+${value}`),
  gapBefore: 10,
});

describe('solveStack', () => {
  it('leaves a stack that fits as it is', () => {
    const plan: OgStackPlan = {
      width: 500,
      height: 400,
      items: [title('Short'), summary('A line')],
      ladder: [{ op: 'size', key: 'title' }],
    };
    const fitted = solveStack(plan, measure(plan));
    expect(fitted.steps).toEqual([]);
    expect(fitted.fits).toBe(true);
    expect(fitted.items.get('title')).toMatchObject({ size: 80, lines: 1 });
    // 80 of title, 10 of gap, 20 of summary.
    expect(fitted.height).toBe(110);
  });

  it('walks the ladder in order and stops as soon as it fits', () => {
    const plan: OgStackPlan = {
      width: 400,
      height: 150,
      items: [
        title('Ten chars! ten chars!'),
        summary('x'.repeat(100)),
        tagRow(5),
      ],
      ladder: [
        { op: 'lines', key: 'summary', to: 2 },
        { op: 'size', key: 'title' },
        { op: 'drop', key: 'tags' },
        { op: 'size', key: 'title' },
      ],
    };
    const fitted = solveStack(plan, measure(plan));
    expect(fitted.fits).toBe(true);
    expect(fitted.steps).toEqual([
      'summary 2 lines',
      'title 60px',
      'drop tags',
      'title 40px',
    ]);
    expect(fitted.height).toBeLessThanOrEqual(150);
  });

  it('never picks a size that would break a word, except the smallest', () => {
    const plan: OgStackPlan = {
      width: 400,
      height: 1000,
      // Fifteen characters: 600 wide at 80, 450 at 60, 300 at 40.
      items: [title('Экспериментальн')],
      ladder: [],
    };
    const fitted = solveStack(plan, measure(plan));
    expect(fitted.items.get('title')).toMatchObject({
      size: 40,
      breakWords: false,
    });

    const hopeless: OgStackPlan = {
      ...plan,
      items: [title('x'.repeat(40))],
    };
    expect(
      solveStack(hopeless, measure(hopeless)).items.get('title'),
    ).toMatchObject({
      size: 40,
      breakWords: true,
    });
  });

  it('counts the tags that did not fit', () => {
    const plan: OgStackPlan = {
      width: 330,
      height: 1000,
      items: [title('Hi'), { ...tagRow(60), hiddenCount: 40 }],
      ladder: [],
    };
    const row = solveStack(plan, measure(plan)).items.get('tags');
    // Two tags of 100 and "+98" of 50, with gaps of 10.
    expect(row).toMatchObject({ kind: 'row', shown: 2, plus: 98 });
  });

  it('always ends with a title that fits, however long', () => {
    const plan: OgStackPlan = {
      width: 400,
      height: 130,
      items: [
        {
          kind: 'block',
          key: 'chip',
          height: 40,
          required: true,
          gapBefore: 0,
        },
        title('word '.repeat(300), { gapBefore: 10 }),
        summary('y'.repeat(3000)),
        tagRow(50),
      ],
      ladder: [{ op: 'size', key: 'title' }],
    };
    const fitted = solveStack(plan, measure(plan));
    expect(fitted.fits).toBe(true);
    expect(fitted.height).toBeLessThanOrEqual(130);
    expect(fitted.items.get('title')).toMatchObject({
      size: 40,
      lines: 2,
      clamped: true,
    });
    expect(fitted.items.has('summary')).toBe(false);
    expect(fitted.items.has('tags')).toBe(false);
  });

  it('keeps one line of title even when nothing else fits', () => {
    const plan: OgStackPlan = {
      width: 400,
      height: 10,
      items: [title('word '.repeat(300))],
      ladder: [],
    };
    const fitted = solveStack(plan, measure(plan));
    expect(fitted.items.get('title')).toMatchObject({ lines: 1 });
    expect(fitted.fits).toBe(false);
  });

  it('takes no gap for a row with nothing to show', () => {
    const plan: OgStackPlan = {
      width: 400,
      height: 1000,
      items: [title('Hi'), tagRow(0)],
      ladder: [],
    };
    const fitted = solveStack(plan, measure(plan));
    expect(fitted.order.map(({ key }) => key)).toEqual(['title']);
    expect(fitted.height).toBe(80);
  });
});

describe('a text beside a picture', () => {
  const lead = { key: 'icon', width: 120, height: 120, gap: 20 };

  it('is set in the width the picture leaves, and is as tall as it', () => {
    const plan: OgStackPlan = {
      width: 500,
      height: 400,
      items: [title('Short', { lead })],
      ladder: [],
    };
    expect(textWidth(plan, plan.items[0] as OgTextItem)).toBe(360);
    const fitted = solveStack(plan, measure(plan)).items.get('title')!;
    expect(fitted).toMatchObject({ kind: 'text', size: 80, lines: 1 });
    expect(fitted.height).toBe(120);
  });

  it('keeps its words whole in that narrower width', () => {
    // Ten characters are 400 wide at 80: a whole line alone, not beside
    // the picture, where 60 is the largest size that keeps the word whole.
    const word = 'Aaaaaaaaaa';
    const alone: OgStackPlan = {
      width: 500,
      height: 400,
      items: [title(word)],
      ladder: [],
    };
    const beside: OgStackPlan = { ...alone, items: [title(word, { lead })] };
    expect(solveStack(alone, measure(alone)).items.get('title')).toMatchObject({
      size: 80,
    });
    expect(
      solveStack(beside, measure(beside)).items.get('title'),
    ).toMatchObject({ size: 60 });
  });
});

describe('packCloud', () => {
  const options = {
    width: 300,
    height: 100,
    gap: 10,
    rowGap: 10,
    plusWidth: () => 40,
    plusHeight: 30,
  };
  const chip = (width: number, height = 30) => ({ width, height });

  it('wraps chips into rows in order', () => {
    const packed = packCloud(
      [chip(100), chip(100), chip(100), chip(100)],
      options,
    );
    expect(packed.rows).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(packed.plus).toBe(0);
    expect(packed.height).toBe(70);
  });

  it('counts what did not fit, making room for the count', () => {
    const packed = packCloud(Array(20).fill(chip(90)), options);
    const shown = packed.rows.flat().length;
    expect(shown + packed.plus).toBe(20);
    expect(packed.plus).toBeGreaterThan(0);
    expect(packed.height).toBeLessThanOrEqual(100);
    // The count shares the last row: its chips and the count fit the width.
    const last = packed.rows.at(-1)!;
    expect(last.length * 90 + last.length * 10 + 40).toBeLessThanOrEqual(300);
  });

  it('skips a chip too wide for any row and counts it', () => {
    const packed = packCloud([chip(1000), chip(50)], options);
    expect(packed.rows).toEqual([[1]]);
    expect(packed.plus).toBe(1);
  });

  it('copes with nothing and with more than was offered', () => {
    expect(packCloud([], options)).toEqual({ rows: [], plus: 0, height: 0 });
    const packed = packCloud([chip(50)], { ...options, hiddenCount: 99 });
    expect(packed.rows.flat()).toEqual([0]);
    expect(packed.plus).toBe(99);
  });
});
