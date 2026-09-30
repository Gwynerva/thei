import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import sharp from 'sharp';
import { analyzePicture } from '../../../server/thei/og/artwork';
import { composeOgCard } from '../../../server/thei/og/compose';
import {
  allowedTones,
  chooseLayout,
  OG_LAYOUT_NAMES,
  type OgLayoutName,
} from '../../../server/thei/og/design';
import { SAFE } from '../../../server/thei/og/geometry';
import type { OgCardContent } from '../../../server/thei/og/model';
import type { OgTone } from '../../../server/thei/og/palette';
import {
  onOgMissingGlyphs,
  renderOgPng,
  renderOgSvg,
  type OgLaidOutNode,
} from '../../../server/thei/og/render';
import { stubOgFonts } from '../../helpers/og-fonts';
import {
  createArtwork,
  ogFixtures,
  type OgArtworkSet,
  type OgFixture,
} from './fixtures';

/**
 * Every card, whatever it holds, fits its card: this draws the fixtures —
 * ordinary cards and the worst cases — and checks the boxes satori laid out.
 *
 * - What a card cannot do without (its headline, the site's signature, a
 *   chart, a calendar leaf) stays inside the area every previewer shows.
 * - The text stack fits its region, sits in the middle of it, and nothing in
 *   it is wider than its column.
 * - Text never runs into the pictures beside it, nor into the icon on its
 *   own line; a tag's icon stands in the middle of the card.
 * - No character is drawn as an empty box.
 */
let art: OgArtworkSet;
let fixtures: OgFixture[];

beforeAll(async () => {
  stubOgFonts();
  art = await createArtwork();
  fixtures = ogFixtures(art);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await art.remove();
});

afterEach(() => onOgMissingGlyphs(undefined));

async function draw(
  content: OgCardContent,
  layout?: OgLayoutName,
  tone?: OgTone,
) {
  const missing: string[] = [];
  onOgMissingGlyphs((_language, segment) => missing.push(segment));
  const card = await composeOgCard(content, {
    ...(layout ? { layout } : {}),
    ...(tone ? { tone } : {}),
  });
  const nodes: OgLaidOutNode[] = [];
  await renderOgSvg(card.node, {
    width: 1200,
    height: 630,
    onNode: (node) => {
      if (node.key) nodes.push(node);
    },
  });
  return { card, nodes, missing };
}

function expectFits(
  label: string,
  { card, nodes, missing }: Awaited<ReturnType<typeof draw>>,
) {
  expect(missing, `${label}: characters without a glyph`).toEqual([]);
  for (const [name, stack] of Object.entries(card.stacks))
    expect(stack.fits, `${label}: ${name} stack fits`).toBe(true);

  for (const node of nodes.filter(({ key }) => key!.startsWith('essential:'))) {
    expect(node.left, `${label}: ${node.key} left`).toBeGreaterThanOrEqual(
      SAFE.left - 1,
    );
    expect(node.top, `${label}: ${node.key} top`).toBeGreaterThanOrEqual(
      SAFE.top - 1,
    );
    expect(
      node.left + node.width,
      `${label}: ${node.key} right`,
    ).toBeLessThanOrEqual(SAFE.right + 1);
    expect(
      node.top + node.height,
      `${label}: ${node.key} bottom`,
    ).toBeLessThanOrEqual(SAFE.bottom + 1);
  }

  const stack = nodes.find(({ key }) => key === 'stack')!;
  const group = nodes.find(({ key }) => key === 'stack:group')!;
  expect(stack, `${label}: a text stack`).toBeDefined();
  expect(group.top).toBeGreaterThanOrEqual(stack.top - 1);
  expect(group.top + group.height).toBeLessThanOrEqual(
    stack.top + stack.height + 1,
  );
  expect(
    Math.abs(group.top + group.height / 2 - (stack.top + stack.height / 2)),
    `${label}: centred`,
  ).toBeLessThanOrEqual(1);
  for (const item of nodes.filter(
    ({ key }) => key!.startsWith('stack:') && key !== 'stack:group',
  ))
    expect(
      item.left + item.width,
      `${label}: ${item.key} width`,
    ).toBeLessThanOrEqual(stack.left + stack.width + 1);

  for (const picture of nodes.filter(
    ({ key }) =>
      key === 'art' ||
      key!.startsWith('tile:') ||
      key === 'essential:leaf' ||
      key === 'essential:cloud',
  )) {
    const apart =
      picture.left >= stack.left + stack.width - 1 ||
      picture.left + picture.width <= stack.left + 1;
    expect(apart, `${label}: text clear of ${picture.key}`).toBe(true);
  }

  // The picture of a stage, a section or an event keeps to its half.
  const art = nodes.find(({ key }) => key === 'art');
  if (card.design.layout === 'media' && art)
    expect(
      art.left,
      `${label}: picture in the right half`,
    ).toBeGreaterThanOrEqual(599);

  const icon = nodes.find(({ key }) => key === 'essential:icon');
  const headline = nodes.find(({ key }) => key === 'essential:headline');
  if (icon && headline) {
    const apart =
      icon.left + icon.width <= headline.left + 1 ||
      icon.top + icon.height <= headline.top + 1;
    expect(apart, `${label}: icon clear of the headline`).toBe(true);
  }
  if (card.design.layout === 'tag' && icon)
    expect(
      Math.abs(icon.left + icon.width / 2 - 600),
      `${label}: icon centred`,
    ).toBeLessThanOrEqual(1);
}

describe('card layouts', () => {
  it('fit every fixture in the layout it gets, in every tone', async () => {
    for (const fixture of fixtures) {
      const main = fixture.content.picture
        ? await analyzePicture(fixture.content.picture)
        : undefined;
      const tiles = (
        await Promise.all(fixture.content.tiles.map(analyzePicture))
      ).filter(Boolean).length;
      const layout = chooseLayout(fixture.content, tiles);
      for (const tone of allowedTones(layout, fixture.content, main))
        expectFits(
          `${fixture.name} (${layout}, ${tone})`,
          await draw(fixture.content, layout, tone),
        );
    }
  }, 240_000);

  it('fit the worst cases in any layout at all', async () => {
    for (const name of [
      'far too much of everything',
      'one character',
      'home with nothing',
    ])
      for (const layout of OG_LAYOUT_NAMES) {
        const fixture = fixtures.find((item) => item.name === name)!;
        expectFits(
          `${name} (${layout})`,
          await draw(fixture.content, layout, 'night'),
        );
      }
  }, 240_000);

  it('come out as 1200×630 pictures', async () => {
    const { card } = await draw(fixtures[0]!.content);
    const png = await renderOgPng(card.node);
    const { width, height, format } = await sharp(png).metadata();
    expect({ width, height, format }).toEqual({
      width: 1200,
      height: 630,
      format: 'png',
    });
  });

  it('draw a card without the pictures that cannot be read', async () => {
    const fixture = fixtures.find(
      (item) => item.name === 'a picture that cannot be read',
    )!;
    const { card, nodes } = await draw(fixture.content);
    expect(card.design.layout).toBe('project');
    expect(nodes.some(({ key }) => key === 'banner')).toBe(false);
    expect(nodes.some(({ key }) => key === 'essential:icon')).toBe(false);
  });
});
