import { describe, expect, it } from 'vitest';
import type { OgArtworkAnalysis } from '../../../server/thei/og/artwork';
import {
  allowedTones,
  chooseDesign,
  chooseLayout,
  OG_LAYOUT_TONES,
} from '../../../server/thei/og/design';
import {
  emptyOgContent,
  type OgCardContent,
  type OgCardKind,
} from '../../../server/thei/og/model';

function analysis(
  overrides: Partial<OgArtworkAnalysis> = {},
): OgArtworkAnalysis {
  return {
    width: 1000,
    height: 1000,
    aspect: 1,
    transparent: 0,
    flat: 0,
    lightness: 0.5,
    chroma: 0.1,
    coverBright: 0.3,
    iconLike: false,
    ...overrides,
  };
}

function card(
  kind: OgCardKind,
  extra: Partial<OgCardContent> = {},
): OgCardContent {
  return {
    ...emptyOgContent(
      kind,
      `${kind}-seed`,
      'Title',
      { name: 'Site' },
      { hue: 200, chroma: 0.12 },
    ),
    ...extra,
  };
}

describe('chooseLayout', () => {
  const cases: [string, OgCardContent, number, string][] = [
    ['the site', card('site'), 0, 'home'],
    [
      'life with a chart',
      card('service:life', {
        histogram: { values: [0, 3], first: '1', last: '2' },
      }),
      0,
      'life',
    ],
    [
      'life with nothing recorded',
      card('service:life', {
        histogram: { values: [0, 0], first: '1', last: '2' },
      }),
      0,
      'poster',
    ],
    [
      'the diary',
      card('service:diary', {
        histogram: { values: [1], first: '1', last: '1' },
      }),
      0,
      'life',
    ],
    [
      'tags with some',
      card('service:tags', {
        cloud: [{ title: 'a', accent: { hue: 0, chroma: 0 } }],
      }),
      0,
      'tags',
    ],
    ['tags with none', card('service:tags'), 0, 'poster'],
    ['rewind', card('service:rewind'), 5, 'poster'],
    ['a preset with pictures', card('service:showcase'), 2, 'collection'],
    ['a preset with one picture', card('service:cv'), 1, 'poster'],
    ['a project', card('project'), 0, 'project'],
    ['a section', card('section'), 0, 'media'],
    ['an event', card('event'), 0, 'media'],
    ['a diary entry', card('diary'), 0, 'calendar'],
    ['a page', card('page'), 0, 'page'],
    ['a tag', card('tag'), 0, 'tag'],
  ];
  for (const [name, content, tiles, layout] of cases)
    it(`gives ${name} the ${layout} layout`, () => {
      expect(chooseLayout(content, tiles)).toBe(layout);
    });

  it('gives a kind of thing one layout, whatever its pictures', () => {
    const pictures = [
      { type: 'file' as const, key: 'a.webp', file: '/a.webp' },
      { type: 'generated' as const, kind: 'project' as const, hue: 10 },
      undefined,
    ];
    for (const kind of ['project', 'section', 'event', 'page', 'tag'] as const)
      expect(
        new Set(
          pictures.map((picture) =>
            chooseLayout(card(kind, picture ? { picture } : {}), 9),
          ),
        ).size,
      ).toBe(1);
  });
});

describe('allowedTones', () => {
  it('gives each kind of thing its own tone', () => {
    expect(allowedTones('project', card('project'), undefined)).toEqual([
      'night',
    ]);
    expect(allowedTones('media', card('event'), undefined)).toEqual(['night']);
    expect(allowedTones('page', card('page'), undefined)).toEqual(['duotone']);
    expect(allowedTones('tag', card('tag'), undefined)).toEqual(['vivid']);
  });

  it('keeps a grey accent off coloured fields', () => {
    const grey = card('page', { accent: { hue: 0, chroma: 0.01 } });
    for (const layout of Object.keys(
      OG_LAYOUT_TONES,
    ) as (keyof typeof OG_LAYOUT_TONES)[]) {
      const tones = allowedTones(layout, grey, undefined);
      expect(tones.length).toBeGreaterThan(0);
      expect(tones).not.toContain('vivid');
      expect(tones).not.toContain('duotone');
    }
  });

  it('pins a dark photograph to a dark leaf and anything else to paper', () => {
    const entry = card('diary');
    expect(
      allowedTones('calendar', entry, analysis({ lightness: 0.3 })),
    ).toEqual(['night']);
    expect(
      allowedTones('calendar', entry, analysis({ lightness: 0.7 })),
    ).toEqual(['paper']);
    expect(allowedTones('calendar', entry, undefined)).toEqual(['paper']);
  });
});

describe('chooseDesign', () => {
  it('always draws the same card the same way', () => {
    const content = card('service:rewind');
    expect(chooseDesign(content, undefined, 0)).toEqual(
      chooseDesign(content, undefined, 0),
    );
  });

  it('spreads the site’s own pages across every tone they allow', () => {
    const counts = new Map<string, number>();
    const runs = 2000;
    for (let index = 0; index < runs; index++) {
      const content = {
        ...card('service:rewind'),
        seed: `service:rewind:${index}`,
      };
      const { tone } = chooseDesign(content, undefined, 0);
      counts.set(tone, (counts.get(tone) ?? 0) + 1);
    }
    for (const tone of OG_LAYOUT_TONES.poster)
      expect(counts.get(tone) ?? 0).toBeGreaterThan(runs * 0.15);
    const directions = new Set<number>();
    for (let index = 0; index < 50; index++)
      directions.add(
        chooseDesign({ ...card('page'), seed: `s${index}` }, undefined, 0)
          .duotoneDirection,
      );
    expect(directions).toEqual(new Set([1, -1]));
  });

  it('takes a layout or a tone it is told to', () => {
    const content = card('page');
    expect(
      chooseDesign(content, undefined, 0, {
        layout: 'media',
        tone: 'paper',
      }),
    ).toMatchObject({
      layout: 'media',
      tone: 'paper',
    });
  });
});
