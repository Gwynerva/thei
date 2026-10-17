import { describe, expect, it } from 'vitest';
import type { ContentOutputData } from '../../shared/content';
import type { AiRevisePart } from '../../shared/ai-actions';
import {
  orderReview,
  proofreadReview,
  REVIEW_MARK,
  versionReview,
} from '../../shared/content-review';
import { tidyBlockHash } from '../../shared/content-edit-markdown/tidy';

/**
 * A change to a text seen part by part: an AI's corrections laid over the
 * text where their words stand — in the running text as marks, outside it
 * on the block's margin — and another version compared block by block; each
 * part taken or left, and only the parts taken make the result.
 */
const { open, id: idMark, was, becomes, close } = REVIEW_MARK;

const paragraph = (id: string, text: string) => ({
  id,
  type: 'paragraph' as const,
  data: { text },
});

const text: ContentOutputData = {
  blocks: [
    { id: 'h', type: 'header', data: { text: 'Полевой день', level: 2 } },
    paragraph('a', 'Ветер был слабый но к обеду усилился.'),
    paragraph('b', 'Вода оказалось холоднее.'),
    {
      id: 'f',
      type: 'contentAttachment',
      data: { title: 'Маршрут', caption: 'Карта стаянок', asset: null },
    },
  ],
} as never;

const correction = (
  id: string,
  find: string,
  replace: string,
  certainty: 'sure' | 'unsure' = 'sure',
): AiRevisePart => ({
  id,
  type: 'correction',
  category: 'spelling',
  certainty,
  reason: 'A reason',
  find,
  replace,
  replaceHtml: replace,
  replacePlain: replace,
});

const parts = [
  correction('c1', 'слабый', 'слабый,'),
  correction('c2', 'оказалось', 'оказалась', 'unsure'),
  correction('c3', 'стаянок', 'стоянок'),
  correction('c4', 'нет таких слов', 'другие'),
];

function words(rows: ReturnType<ReturnType<typeof proofreadReview>['rows']>) {
  return rows.flatMap((row) =>
    row.type === 'block'
      ? [JSON.stringify(row.block.data)]
      : row.type === 'gone'
        ? [row.quote]
        : [],
  );
}

describe('an AI’s corrections', () => {
  const review = proofreadReview(text, parts);

  it('are parts with the words around them, under their heading', () => {
    const c2 = review.parts.find((part) => part.id === 'c2')!;
    expect(c2).toMatchObject({
      sure: false,
      whole: false,
      aside: false,
      heading: 'Полевой день',
      words: {
        before: 'оказалось',
        after: 'оказалась',
        around: ['Вода ', ' холоднее.'],
      },
    });
    // Words outside the running text go to the block's margin.
    expect(review.parts.find((part) => part.id === 'c3')!.aside).toBe(true);
    // Words no longer in the text cannot be decided.
    expect(review.parts.find((part) => part.id === 'c4')!.settled).toBe(
      'stale',
    );
  });

  it('read as they will, marked where they stand', () => {
    const rows = review.rows({}, 'read');
    expect(words(rows).join()).toContain(`${open}c1${idMark}слабый,${close}`);
    expect(words(rows).join()).toContain(`${open}c2${idMark}оказалась${close}`);
    // The caption reads corrected, its part on the block's margin.
    const file = rows.find(
      (row) => row.type === 'block' && row.block.type === 'contentAttachment',
    );
    expect(file).toMatchObject({ parts: ['c3'] });
    expect(JSON.stringify(file)).toContain('Карта стоянок');
  });

  it('show what goes and what comes, and what is kept as it is', () => {
    const rows = review.rows({ c2: 'kept' }, 'diff');
    expect(words(rows).join()).toContain(
      `${open}c1${idMark}${was}слабый${becomes}слабый,${close}`,
    );
    expect(words(rows).join()).toContain(`${open}c2${idMark}оказалось${close}`);
  });

  it('change the text only where taken', () => {
    const result = review.result({
      c1: 'accepted',
      c2: 'kept',
      c3: 'accepted',
    });
    const all = JSON.stringify(result.blocks);
    expect(all).toContain('слабый, но');
    expect(all).toContain('Вода оказалось');
    expect(all).toContain('Карта стоянок');
    expect(review.result({})).toBe(text);
  });

  it('show a part made already as made', () => {
    const later = proofreadReview(text, parts, new Map([['c1', 'applied']]));
    expect(later.parts.find((part) => part.id === 'c1')!.settled).toBe(
      'applied',
    );
    expect(words(later.rows({}, 'read')).join()).not.toContain(`${open}c1`);
  });
});

describe('another version', () => {
  const current: ContentOutputData = {
    blocks: [
      paragraph('a', 'Утром вышли на катере.'),
      paragraph('b', 'Ветер усилился к обеду.'),
      paragraph('c', 'Вечером разбирали снимки.'),
    ],
  } as never;
  const version: ContentOutputData = {
    blocks: [
      paragraph('a', 'Утром вышли на катере.'),
      paragraph('b', 'Ветер стал сильнее к обеду.'),
      paragraph('d', 'Капитан рассказывал про шторм.'),
    ],
  } as never;
  const review = versionReview(current, version);
  const kinds = Object.fromEntries(
    review.parts.map((part) => [part.kind, part.id]),
  );

  it('is a part for each block rewritten, come or gone', () => {
    expect(review.parts.map((part) => part.kind).sort()).toEqual([
      'added',
      'changed',
      'removed',
    ]);
    expect(review.parts.every((part) => part.whole)).toBe(true);
    const changed = review.parts.find((part) => part.kind === 'changed')!;
    expect(changed.diff?.some((part) => part.kind === 'added')).toBe(true);
  });

  it('leaves the text as it is until a part is taken', () => {
    expect(review.result({}).blocks.map((block) => block.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    const all = Object.fromEntries(
      review.parts.map((part) => [part.id, 'accepted' as const]),
    );
    expect(review.result(all).blocks).toEqual(version.blocks);
  });

  it('takes only what is taken', () => {
    const result = review.result({ [kinds.added!]: 'accepted' });
    expect(result.blocks.map((block) => block.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(JSON.stringify(result.blocks)).toContain('Ветер усилился');
  });

  it('folds a block that would go to a line, and strikes it in the diff', () => {
    expect(review.rows({}, 'read')).toContainEqual({
      type: 'gone',
      part: kinds.removed,
      quote: 'Вечером разбирали снимки.',
    });
    expect(review.rows({}, 'diff')).toContainEqual(
      expect.objectContaining({
        type: 'block',
        was: true,
        part: kinds.removed,
      }),
    );
    expect(review.rows({ [kinds.removed!]: 'kept' }, 'read')).toContainEqual(
      expect.objectContaining({ type: 'block', parts: [] }),
    );
  });
});

describe('another version’s files', () => {
  const file = (assetUuid: string, extension: string) => ({
    id: assetUuid,
    asset: { assetUuid, type: 'other', extension, size: 1 },
  });
  const group = (id: string, items: ReturnType<typeof file>[]) => ({
    id,
    type: 'contentFileGroup' as const,
    data: { items },
  });
  const describeBlock = (block: { data: unknown }) => {
    const items = (block.data as { items?: { asset: { extension: string } }[] })
      .items;
    return items ? items.map((item) => item.asset.extension).join(', ') : '';
  };

  it('says what a block without words holds', () => {
    const review = versionReview(
      { blocks: [paragraph('a', 'Утром.')] } as never,
      {
        blocks: [
          paragraph('a', 'Утром.'),
          group('g', [file('x', 'psd'), file('y', 'txt')]),
        ],
      } as never,
      { describeBlock },
    );
    expect(review.parts).toEqual([
      expect.objectContaining({ kind: 'added', quote: 'psd, txt' }),
    ]);
  });

  it('shows a block whose files changed as it is and as it would be', () => {
    const titled = (items: ReturnType<typeof file>[]) => ({
      ...group('g', items),
      data: { title: 'Сканы', items },
    });
    const review = versionReview(
      { blocks: [titled([file('x', 'psd')])] } as never,
      { blocks: [titled([file('x', 'psd'), file('y', 'txt')])] } as never,
      { describeBlock },
    );
    expect(review.parts).toEqual([
      expect.objectContaining({
        kind: 'changed',
        before: 'psd',
        quote: 'psd, txt',
        changes: [{ what: 'files' }],
        files: [
          expect.objectContaining({ change: 'same' }),
          expect.objectContaining({ change: 'added' }),
        ],
      }),
    ]);
  });

  it('shows each file of a block that comes or goes', () => {
    const review = versionReview(
      { blocks: [group('g', [file('x', 'psd')])] } as never,
      { blocks: [] } as never,
    );
    expect(review.parts[0]?.files).toEqual([
      { asset: expect.objectContaining({ assetUuid: 'x' }), change: 'removed' },
    ]);
  });
});

describe('what a version changes besides the words', () => {
  const compare = (before: unknown, after: unknown) =>
    versionReview(
      { blocks: [{ id: 'x', ...(before as object) }] } as never,
      { blocks: [{ id: 'x', ...(after as object) }] } as never,
    ).parts[0];

  it('names a heading’s level, a list’s style and its ticks', () => {
    expect(
      compare(
        { type: 'header', data: { text: 'День', level: 2 } },
        { type: 'header', data: { text: 'День', level: 3 } },
      )?.changes,
    ).toEqual([{ what: 'level', from: 2, to: 3 }]);
    const list = (style: string, checked = false) => ({
      type: 'list',
      data: {
        style,
        meta: {},
        items: [{ content: 'Хлеб', meta: { checked }, items: [] }],
      },
    });
    expect(compare(list('unordered'), list('ordered'))?.changes).toEqual([
      { what: 'style', from: 'unordered', to: 'ordered' },
    ]);
    expect(
      compare(list('checklist'), list('checklist', true))?.changes,
    ).toEqual([{ what: 'checks' }]);
  });

  it('names words dressed otherwise, and a block hidden as a spoiler', () => {
    const part = compare(
      { type: 'paragraph', data: { text: 'Вечером дождь.' } },
      {
        type: 'paragraph',
        data: { text: 'Вечером <b>дождь</b>.' },
        tunes: { spoiler: true },
      },
    );
    expect(part?.changes).toEqual([
      { what: 'spoiler', on: true },
      { what: 'markup' },
    ]);
    expect(part?.diff).toBeUndefined();
  });

  it('says a change it cannot name, and nothing beside words rewritten', () => {
    expect(
      compare(
        {
          type: 'integration',
          data: { provider: 'youtube', videoId: 'aaaaaaaaaaa' },
        },
        {
          type: 'integration',
          data: { provider: 'youtube', videoId: 'bbbbbbbbbbb' },
        },
      )?.changes,
    ).toEqual([{ what: 'target' }]);
    const rewritten = compare(
      { type: 'paragraph', data: { text: 'Утром туман.' } },
      { type: 'paragraph', data: { text: 'Утром был туман.' } },
    );
    expect(rewritten?.diff).toBeDefined();
    expect(rewritten?.changes).toBeUndefined();
  });
});

describe('a part left as it was', () => {
  const now = {
    blocks: [paragraph('a', 'Утро.'), paragraph('b', 'Обед на берегу.')],
  } as never;
  const then = {
    blocks: [
      paragraph('a', 'Раннее утро.'),
      paragraph('c', 'Новый абзац о реке.'),
    ],
  } as never;
  const review = versionReview(now, then);
  const ids = Object.fromEntries(
    review.parts.map((part) => [part.kind, part.id]),
  );

  it('keeps its place in the text, to be gone back to', () => {
    const left = Object.fromEntries(
      review.parts.map((part) => [part.id, 'kept' as const]),
    );
    const rows = review.rows(left, 'read');
    expect(rows).toContainEqual(
      expect.objectContaining({ type: 'block', part: ids.changed }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ type: 'gone', part: ids.added }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ type: 'block', part: ids.removed }),
    );
    // And the text stays as it is.
    expect(review.result(left)).toEqual(now);
  });
});

describe('an AI’s new order', () => {
  const base: ContentOutputData = {
    blocks: [
      paragraph('a', 'Morning on the boat.'),
      paragraph('b', 'Morning on the boat.'),
      paragraph('c', 'Evening with the photos.'),
    ],
  } as never;
  const plan = {
    keys: base.blocks.map(tidyBlockHash),
    items: [
      { type: 'block' as const, from: 0 },
      {
        type: 'block' as const,
        from: 1,
        removed: { reason: 'A literal repeat', duplicateOf: 0 },
      },
      { type: 'heading' as const, text: 'Evening', level: 2 as const },
      { type: 'block' as const, from: 2 },
    ],
  };
  const parts: AiRevisePart[] = [
    {
      id: 'r1',
      type: 'removal',
      item: 1,
      quote: 'Morning on the boat.',
      certainty: 'sure',
      reason: 'A literal repeat',
    },
    {
      id: 'h2',
      type: 'heading',
      item: 2,
      text: 'Evening',
      level: 2,
      certainty: 'sure',
      reason: '',
    },
  ];
  const review = orderReview(base, parts, plan);

  it('reads as it will, a repeat folded and a heading tinted', () => {
    const rows = review.rows({}, 'read');
    expect(rows.map((row) => row.type)).toEqual([
      'block',
      'gone',
      'block',
      'block',
    ]);
    expect(rows[2]).toMatchObject({ part: 'h2' });
    // Kept as it was, the repeat stays, marked by its part; left out, the
    // heading folds to a line: both are there to go back to.
    const kept = review.rows({ r1: 'kept', h2: 'kept' }, 'read');
    expect(kept.map((row) => row.type)).toEqual([
      'block',
      'block',
      'gone',
      'block',
    ]);
    expect(kept[1]).toMatchObject({ part: 'r1' });
    expect(kept[2]).toMatchObject({ part: 'h2', quote: 'Evening' });
  });

  it('takes only what is accepted', () => {
    expect(review.result({})).toBe(base);
    const taken = review.result({ r1: 'accepted', h2: 'kept' });
    expect(taken.blocks.map((block) => block.id)).toEqual(['a', 'c']);
    const both = review.result({ r1: 'accepted', h2: 'accepted' });
    expect(both.blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'header',
      'paragraph',
    ]);
  });

  it('is settled once the text has moved on too far', () => {
    const later = orderReview(
      { blocks: [paragraph('z', 'Other.')] } as never,
      parts,
      plan,
    );
    expect(later.parts.every((part) => part.settled === 'stale')).toBe(true);
    expect(later.result({ r1: 'accepted' }).blocks).toHaveLength(1);
  });
});

describe('another version, with private parts and moves', () => {
  const edge = (id: string, sectionId: string, side: 'start' | 'end') => ({
    id,
    type: 'privateSectionBoundary' as const,
    data: { sectionId, edge: side },
  });
  const ids = (data: ContentOutputData) => data.blocks.map((block) => block.id);

  it('private sections follow the blocks: taking a part never makes one public', () => {
    // The section was made after the version: in the version, S is public.
    const current: ContentOutputData = {
      blocks: [
        paragraph('p', 'We went today.'),
        edge('e1', 's1', 'start'),
        paragraph('s', 'A secret.'),
        edge('e2', 's1', 'end'),
      ],
    } as never;
    const version: ContentOutputData = {
      blocks: [
        paragraph('p', 'We went yesterday.'),
        paragraph('s', 'A secret.'),
      ],
    } as never;
    const review = versionReview(current, version);
    expect(review.parts.map((part) => part.kind)).toEqual(['changed']);
    // Left as it is, the text is the text, edges and all.
    expect(review.result({}).blocks).toEqual(current.blocks);
    // Taken, the changed block comes; the secret stays inside its edges.
    const taken = review.result({ [review.parts[0]!.id]: 'accepted' });
    expect(ids(taken)).toEqual(['p', 'e1', 's', 'e2']);
    expect(JSON.stringify(taken.blocks[0])).toContain('yesterday');
    expect(review.rows({}, 'read').map((row) => row.type)).toEqual([
      'block',
      'edge',
      'block',
      'edge',
    ]);
  });

  it('a block private only in the version comes back private', () => {
    const current: ContentOutputData = {
      blocks: [paragraph('p', 'Open.')],
    } as never;
    const version: ContentOutputData = {
      blocks: [
        paragraph('p', 'Open.'),
        edge('e1', 's1', 'start'),
        paragraph('q', 'Hidden then.'),
        edge('e2', 's1', 'end'),
      ],
    } as never;
    const review = versionReview(current, version);
    const added = review.parts.find((part) => part.kind === 'added')!;
    expect(added.private).toBe(true);
    expect(ids(review.result({ [added.id]: 'accepted' }))).toEqual([
      'p',
      'e1',
      'q',
      'e2',
    ]);
  });

  it('a block moved and taken twice stands twice under ids of its own', () => {
    const current: ContentOutputData = {
      blocks: [paragraph('a', 'First.'), paragraph('b', 'Second.')],
    } as never;
    const version: ContentOutputData = {
      blocks: [paragraph('b', 'Second.'), paragraph('a', 'First.')],
    } as never;
    const review = versionReview(current, version);
    const decisions = Object.fromEntries(
      review.parts.map((part) => [
        part.id,
        part.kind === 'removed' ? ('kept' as const) : ('accepted' as const),
      ]),
    );
    const result = ids(review.result(decisions));
    expect(new Set(result).size).toBe(result.length);
  });
});

describe('the rules a new order and corrections keep', () => {
  const ids = (data: ContentOutputData) => data.blocks.map((block) => block.id);

  it('a heading taken takes the moves with it; the moves kept keep it all', () => {
    const base: ContentOutputData = {
      blocks: [paragraph('a', 'Evening.'), paragraph('b', 'Morning.')],
    } as never;
    const plan = {
      keys: base.blocks.map(tidyBlockHash),
      items: [
        { type: 'heading' as const, text: 'Day', level: 2 as const },
        { type: 'block' as const, from: 1 },
        { type: 'block' as const, from: 0 },
      ],
    };
    const parts: AiRevisePart[] = [
      {
        id: 'order',
        type: 'order',
        moved: [1],
        certainty: 'sure',
        reason: 'Morning first',
      },
      {
        id: 'h0',
        type: 'heading',
        item: 0,
        text: 'Day',
        level: 2,
        certainty: 'sure',
        reason: '',
      },
    ];
    const review = orderReview(base, parts, plan);
    expect(ids(review.result({ h0: 'accepted' })).length).toBe(3);
    expect(review.result({ h0: 'accepted', order: 'kept' })).toBe(base);

    // The screen decides alike: a heading taken takes the moves, the moves
    // kept keep the heading, and the text as it is still marks the moves.
    expect(review.implied?.({}, 'h0', 'accepted')).toEqual({
      order: 'accepted',
    });
    expect(review.implied?.({ h0: 'accepted' }, 'order', 'kept')).toEqual({
      h0: 'kept',
    });
    const rows = review.rows({ order: 'kept', h0: 'kept' }, 'read');
    expect(rows).toEqual([
      expect.objectContaining({ type: 'block', parts: [] }),
      expect.objectContaining({ type: 'block', part: 'order' }),
    ]);
    expect(review.parts.find((part) => part.id === 'order')?.moved).toBe(1);
  });

  it('a removed repeat changed since stays', () => {
    const base: ContentOutputData = {
      blocks: [paragraph('a', 'Same.'), paragraph('b', 'Same.')],
    } as never;
    const plan = {
      keys: base.blocks.map(tidyBlockHash),
      items: [
        { type: 'block' as const, from: 0 },
        {
          type: 'block' as const,
          from: 1,
          removed: { reason: 'A repeat' },
        },
      ],
    };
    const parts: AiRevisePart[] = [
      {
        id: 'r1',
        type: 'removal',
        item: 1,
        quote: 'Same.',
        certainty: 'sure',
        reason: 'A repeat',
      },
    ];
    // The owner put a picture where the repeat was.
    const now: ContentOutputData = {
      blocks: [
        paragraph('a', 'Same.'),
        { id: 'm', type: 'contentMedia', data: { asset: { assetUuid: 'x' } } },
      ],
    } as never;
    const review = orderReview(now, parts, plan);
    expect(ids(review.result({ r1: 'accepted' }))).toEqual(['a', 'm']);
  });

  it('a correction in a heading puts its words, never its marks', () => {
    const data: ContentOutputData = {
      blocks: [
        {
          id: 'h',
          type: 'header',
          data: { text: 'file_nmae at last', level: 2 },
        },
      ],
    } as never;
    const review = proofreadReview(data, [
      {
        id: 'c1',
        type: 'correction',
        category: 'spelling',
        certainty: 'sure',
        reason: '',
        find: 'file_nmae',
        replace: 'file\\_name',
        replaceHtml: 'file_name',
        replacePlain: 'file_name',
      },
    ]);
    expect(JSON.stringify(review.result({ c1: 'accepted' }))).toContain(
      'file_name at last',
    );
  });
});

describe('links mended, part by part', () => {
  const link = (id: string, words: string, fragment?: string) =>
    `<a data-content-link="entity" data-entity-type="project" data-entity-id="${id}"${fragment ? ` data-entity-fragment="${fragment}"` : ''}>${words}</a>`;
  const text: ContentOutputData = {
    blocks: [
      {
        id: 'p1',
        type: 'paragraph',
        data: {
          text: `See ${link('a', 'the results', 'results')} and ${link('gone', 'the old one')}.`,
        },
      },
      {
        id: 'k1',
        type: 'entityLink',
        data: { entityType: 'project', entityId: 'a', fragment: 'results' },
      },
    ],
  };
  const parts: AiRevisePart[] = [
    {
      id: 'l1',
      type: 'relink',
      link: 'p1/0/0',
      nth: 0,
      words: 'the results',
      from: 'thei:project/a#results',
      to: 'thei:project/a#outcomes',
      fromTitle: 'Harbour › results',
      toTitle: 'Harbour › Outcomes',
      certainty: 'sure',
      reason: 'Renamed',
    },
    {
      id: 'l2',
      type: 'relink',
      link: 'p1/0/1',
      nth: 0,
      words: 'the old one',
      from: 'thei:project/gone',
      to: null,
      fromTitle: '',
      certainty: 'unsure',
      reason: 'Gone',
    },
    {
      id: 'l3',
      type: 'relink',
      link: 'k1/card',
      nth: 0,
      words: '',
      from: 'thei:project/a#results',
      to: 'thei:project/a',
      fromTitle: 'Harbour › results',
      toTitle: 'Harbour',
      certainty: 'sure',
      reason: 'The whole of it',
    },
  ];

  it('says where each link leads now and would, a card on its margin', () => {
    const review = proofreadReview(text, parts);
    expect(
      review.parts.map((part) => [part.id, part.kind, part.aside]),
    ).toEqual([
      ['l1', 'link', false],
      ['l2', 'link', false],
      ['l3', 'link', true],
    ]);
    expect(review.parts[1]!.link).toEqual({ words: 'the old one' });
    expect(review.parts[2]).not.toHaveProperty('place');
  });

  it('marks the words of each and shows them leading where they would', () => {
    const review = proofreadReview(text, parts);
    const rows = review.rows({}, 'read');
    const shown = JSON.stringify(rows[0]);
    expect(shown).toContain(
      `${REVIEW_MARK.open}l1${REVIEW_MARK.id}the results`,
    );
    expect(shown).toContain('data-entity-fragment=\\"outcomes\\"');
    // The words of a link taken off stay, marked, without it.
    expect(shown).toContain(
      `${REVIEW_MARK.open}l2${REVIEW_MARK.id}the old one`,
    );
    expect(shown).not.toContain('data-entity-id=\\"gone\\"');
    expect(rows[1]).toMatchObject({ type: 'block', parts: ['l3'] });
    // Kept, a link leads where it did.
    expect(JSON.stringify(review.rows({ l1: 'kept' }, 'read')[0])).toContain(
      'data-entity-fragment=\\"results\\"',
    );
  });

  it('gives the text with the links taken, and a link changed since as settled', () => {
    const review = proofreadReview(text, parts);
    const result = review.result({ l1: 'accepted', l3: 'accepted' });
    expect((result.blocks[0]!.data as { text: string }).text).toBe(
      `See ${link('a', 'the results', 'outcomes')} and ${link('gone', 'the old one')}.`,
    );
    expect(result.blocks[1]!.data).toEqual({
      entityType: 'project',
      entityId: 'a',
    });
    const moved = proofreadReview(
      {
        blocks: [
          {
            id: 'p1',
            type: 'paragraph',
            data: { text: `See ${link('a', 'the results', 'elsewhere')}.` },
          },
        ],
      },
      parts.slice(0, 1),
    );
    expect(moved.parts[0]!.settled).toBe('stale');
  });
});
