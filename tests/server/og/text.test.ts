import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { OG_FONT_FAMILY } from '../../../server/thei/og/font-set';
import { emptyOgContent } from '../../../server/thei/og/model';
import {
  el,
  onOgMissingGlyphs,
  renderOgSvg,
} from '../../../server/thei/og/render';
import {
  drawableContent,
  OG_CLAIMED_RANGES,
  OG_FONT_GAPS,
  ogCovers,
  ogDrawable,
} from '../../../server/thei/og/text';
import { stubOgFonts } from '../../helpers/og-fonts';

beforeAll(() => stubOgFonts());
afterAll(() => vi.unstubAllGlobals());
afterEach(() => onOgMissingGlyphs(undefined));

const NBSP = String.fromCharCode(0xa0);

describe('ogDrawable', () => {
  it('folds white space but keeps the no-break spaces of typography', () => {
    expect(ogDrawable(`  В${NBSP}доме \n «тихо»  —\tдождь `)).toBe(
      `В${NBSP}доме «тихо» — дождь`,
    );
  });

  it('drops emoji, and a text of nothing but emoji is not drawn', () => {
    expect(ogDrawable('Поход 🏔️ в горы 👨‍👩‍👧')).toBe('Поход в горы');
    expect(ogDrawable('🚀🔥')).toBeUndefined();
    expect(ogDrawable('   ')).toBeUndefined();
    expect(ogDrawable(undefined)).toBeUndefined();
  });

  it('drops a few characters no font has, but not a whole script', () => {
    // An arrow and an approximation sign are in none of the subsets.
    expect(ogDrawable('Москва → Питер ≈ 700 км')).toBe('Москва Питер 700 км');
    expect(ogDrawable('漢字の題名')).toBeUndefined();
    expect(ogDrawable('مرحبا بالعالم')).toBeUndefined();
    // Mostly drawable: the stray characters go, the rest stays.
    expect(ogDrawable('Tokyo 東 trip notes')).toBe('Tokyo trip notes');
    // Mostly not: better no text than a fragment.
    expect(ogDrawable('Tokyo 東京の旅行記録')).toBeUndefined();
  });

  it('agrees with the fonts about what they cover', async () => {
    const samples = [
      'Aa Zz 09 ÀÿĀžƀɏ ṀẞỹȘ',
      'АяЁёЂџҐґҶҷӁ',
      'ΑωάώϊΰϏ',
      'ĂăĐđƠơƯưẠỹ',
      '«»„“”‘’—–…·•№€™†',
    ];
    for (const sample of samples) {
      for (const character of sample.replaceAll(' ', ''))
        expect(ogCovers(character), character).toBe(true);
      const missing: string[] = [];
      onOgMissingGlyphs((_language, segment) => missing.push(segment));
      await renderOgSvg(
        el('div', {
          style: { display: 'flex', fontFamily: OG_FONT_FAMILY, fontSize: 32 },
          children: sample,
        }),
        { width: 1200 },
      );
      expect(missing, sample).toEqual([]);
    }
    for (const character of ['→', '≈', '漢', '😀', 'ℵ', '‰'])
      expect(ogCovers(character), character).toBe(false);
  });

  it('knows every gap in the fonts, and no more', async () => {
    // Every character the subsets claim is drawn; the ones satori finds no
    // glyph for must be exactly the listed gaps.
    const drawable = OG_CLAIMED_RANGES.flatMap(([start, end]) =>
      Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ).filter(
      (code) =>
        !/[\p{Cc}\p{Cf}\p{Z}\p{Mn}\p{Cn}\p{Co}]/u.test(
          String.fromCodePoint(code),
        ),
    );
    const missing = new Set<number>();
    onOgMissingGlyphs((_language, segment) => {
      for (const character of segment)
        if (character.trim()) missing.add(character.codePointAt(0)!);
    });
    for (let index = 0; index < drawable.length; index += 150)
      await renderOgSvg(
        el(
          'div',
          {
            style: {
              display: 'flex',
              flexWrap: 'wrap',
              fontFamily: OG_FONT_FAMILY,
              fontSize: 20,
            },
          },
          drawable
            .slice(index, index + 150)
            .map((code) => String.fromCodePoint(code))
            .join(' '),
        ),
        { width: 1200 },
      );
    const gaps = [...OG_FONT_GAPS].filter((code) => drawable.includes(code));
    expect([...missing].sort((a, b) => a - b)).toEqual(
      gaps.sort((a, b) => a - b),
    );
  });

  it('draws a typed hyphen or dash as one the fonts have', () => {
    const hyphen = String.fromCharCode(0x2011);
    expect(ogDrawable(`что${hyphen}то`)).toBe('что-то');
  });
});

describe('drawableContent', () => {
  const site = { name: 'Site' };
  const accent = { hue: 0, chroma: 0.1 };

  it('falls back to the parent title, then to the kind', () => {
    const withParent = {
      ...emptyOgContent('stage', 's', '🚀', site, accent),
      parent: { title: 'Parent project' },
    };
    expect(drawableContent(withParent, 'Stage').headline).toBe(
      'Parent project',
    );
    expect(
      drawableContent(
        emptyOgContent('project', 'p', '漢字', site, accent),
        'Project',
      ).headline,
    ).toBe('Project');
  });

  it('leaves out what cannot be drawn and keeps the rest of a list', () => {
    const content = drawableContent(
      {
        ...emptyOgContent('project', 'p', 'Title', site, accent),
        summary: '🎉',
        tags: ['море', '漢字', 'north'],
        chips: [{ icon: 'project', label: 'Project' }],
        meta: [
          { icon: 'calendar', text: '2024' },
          { icon: 'event', text: '😀' },
        ],
      },
      'Project',
    );
    expect(content.summary).toBeUndefined();
    expect(content.tags).toEqual(['море', 'north']);
    expect(content.meta).toEqual([{ icon: 'calendar', text: '2024' }]);
  });
});
