import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OgStackPlan } from '../../../server/thei/og/fit';
import { OG_FONT_FAMILY } from '../../../server/thei/og/font-set';
import { probe } from '../../../server/thei/og/measure';
import {
  el,
  renderOgSvg,
  type OgLaidOutNode,
} from '../../../server/thei/og/render';
import { drawStack, fitStack } from '../../../server/thei/og/stack';
import { stubOgFonts } from '../../helpers/og-fonts';

beforeAll(() => stubOgFonts());
afterAll(() => vi.unstubAllGlobals());

const chip = (text: string) =>
  el(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        padding: '6px 16px',
        borderRadius: 999,
        fontSize: 24,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
    },
    text,
  );

function plan(title: string, summary: string, tags: string[]): OgStackPlan {
  return {
    width: 572,
    height: 446,
    items: [
      {
        kind: 'text',
        key: 'title',
        text: title,
        sizes: [72, 64, 56, 50, 44, 38],
        lineHeight: 1.08,
        weight: 700,
        maxLines: 3,
        balance: true,
        keepWords: true,
        required: true,
        gapBefore: 0,
      },
      {
        kind: 'text',
        key: 'summary',
        text: summary,
        sizes: [27],
        lineHeight: 1.35,
        weight: 400,
        maxLines: 3,
        gapBefore: 16,
      },
      {
        kind: 'row',
        key: 'tags',
        height: 44,
        gap: 12,
        items: tags.map((tag, index) => ({
          key: `t${index}`,
          node: chip(tag),
        })),
        plus: (count) => chip(`+${count}`),
        gapBefore: 24,
      },
    ],
    ladder: [
      { op: 'lines', key: 'summary', to: 2 },
      { op: 'size', key: 'title' },
      { op: 'drop', key: 'tags' },
      { op: 'size', key: 'title' },
      { op: 'size', key: 'title' },
      { op: 'lines', key: 'summary', to: 1 },
      { op: 'size', key: 'title' },
      { op: 'drop', key: 'summary' },
      { op: 'size', key: 'title' },
    ],
  };
}

async function draw(stack: OgStackPlan) {
  const fitted = await fitStack(stack);
  const nodes = new Map<string, OgLaidOutNode>();
  await renderOgSvg(
    el(
      'div',
      {
        style: {
          display: 'flex',
          width: 1200,
          height: 630,
          fontFamily: OG_FONT_FAMILY,
        },
      },
      drawStack(
        stack,
        fitted,
        { left: 564, top: 60 },
        {
          text: (_item, style) => el('div', { style }, _item.text),
        },
      ),
    ),
    {
      width: 1200,
      height: 630,
      onNode: (node) => {
        if (node.key) nodes.set(node.key, node);
      },
    },
  );
  return { fitted, nodes };
}

describe('measuring with satori', () => {
  it('reports the natural size of what it is given', async () => {
    const boxes = await probe([
      { key: 'short', node: chip('Проект') },
      { key: 'long', node: chip('Очень '.repeat(40)) },
    ]);
    expect(boxes.get('short')!.width).toBeGreaterThan(50);
    // Free to run far past the picture's own width.
    expect(boxes.get('long')!.width).toBeGreaterThan(1200);
  });

  for (const [name, title, summary, tags] of [
    ['a short card', 'Атлас', 'Карты.', ['#море']],
    [
      'an ordinary card',
      'Атлас северных маяков',
      'Три года экспедиций по Белому морю: карты, дневники, фотографии и реставрация двух маяков.',
      ['#море', '#фотография', '#экспедиции', '#север', '#маяки'],
    ],
    [
      'far too much of everything',
      'Полностью приватный проект с закрытыми исследованиями, файлами, заметками команды и всем остальным, что обычно не показывают никому',
      'Очень длинное описание. '.repeat(80),
      Array.from({ length: 60 }, (_, index) => `#длинный-тег-${index}`),
    ],
    ['one unbreakable word', 'Экспериментальныйпроектбезпробелов', '', []],
    // Satori never returns from balancing a lone character.
    ['a one-character title', 'Я', '', []],
  ] as const)
    it(`draws ${name} exactly as tall as predicted, centred`, async () => {
      const stack = plan(title, summary, [...tags]);
      if (!summary) stack.items.splice(1, 1);
      const { fitted, nodes } = await draw(stack);
      expect(fitted.fits).toBe(true);

      for (const { key } of fitted.order) {
        const box = nodes.get(`stack:${key}`)!;
        expect(
          Math.abs(box.height - fitted.items.get(key)!.height),
        ).toBeLessThanOrEqual(1);
        // Nothing is wider than the column.
        expect(box.left + box.width).toBeLessThanOrEqual(564 + 572 + 0.5);
      }
      const group = nodes.get('stack:group')!;
      expect(Math.abs(group.height - fitted.height)).toBeLessThanOrEqual(1);
      expect(group.top).toBeGreaterThanOrEqual(60);
      expect(group.top + group.height).toBeLessThanOrEqual(60 + 446 + 1);
      // The group sits in the middle of the region.
      const middle = group.top + group.height / 2;
      expect(Math.abs(middle - (60 + 446 / 2))).toBeLessThanOrEqual(1);
    });
});
