import { describe, expect, it } from 'vitest';
import {
  normalizeContentData,
  type ContentOutputBlock,
} from '#layers/thei/shared/content';
import { contentToEditMarkdown } from '#layers/thei/shared/content-edit-markdown/serialize';
import { parseEditMarkdownToBlocks } from '#layers/thei/shared/content-edit-markdown/parse';
import {
  alignTidyBase,
  applyTidy,
  planTidy,
  tidyBlockHash,
  tidyBlockText,
  tidyStats,
  type TidyCommentInput,
  type TidyRemovalInput,
} from '#layers/thei/shared/content-edit-markdown/tidy';

/** A diary entry that jumps between work and a walk, and says one thing twice. */
const entry = normalizeContentData({
  blocks: [
    {
      id: 'w1',
      type: 'paragraph',
      data: { text: 'С утра чинил билд, ваще не собирался.' },
    },
    {
      id: 'p1',
      type: 'paragraph',
      data: { text: 'Гуляли в парке. Видел цаплю у пруда.' },
    },
    {
      id: 'w2',
      type: 'paragraph',
      data: { text: 'К обеду билд <b>собрался</b>, выкатил релиз.' },
    },
    { id: 'p2', type: 'paragraph', data: { text: 'Гуляли в парке.' } },
    {
      id: 'm1',
      type: 'contentMedia',
      data: {
        asset: { assetUuid: 'a-1' },
        layout: 'centered',
        caption: 'Цапля',
      },
    },
  ],
});
const blocks = entry.blocks;

function written(markdown: string) {
  return normalizeContentData({
    blocks: parseEditMarkdownToBlocks(markdown).blocks as never,
  }).blocks;
}

function plan(
  markdown: string,
  removals: TidyRemovalInput[] = [],
  comments: TidyCommentInput[] = [],
  stored: readonly ContentOutputBlock[] = blocks,
) {
  return planTidy(stored, written(markdown), removals, comments);
}

const texts = (result: readonly ContentOutputBlock[]) =>
  result.map(tidyBlockText);

describe('tidying a text', () => {
  it('reads the text back as it is: nothing to tidy', () => {
    const result = plan(contentToEditMarkdown(entry));
    expect(result.problems).toEqual([
      'Nothing to tidy: the text is in order as it stands. Leave no suggestion.',
    ]);
  });

  it('reads back files whose captions look like syntax, and marks side by side', () => {
    const tricky = normalizeContentData({
      blocks: [
        {
          type: 'contentFileGroup',
          data: {
            items: [
              {
                id: 'f1',
                asset: { assetUuid: 'a-1' },
                caption:
                  'see <abbr data-content-hint="RFC [draft">spec</abbr> *x*',
              },
              { id: 'f2', asset: { assetUuid: 'a-2' }, caption: 'kept' },
            ],
          },
        },
        {
          type: 'contentMedia',
          data: {
            asset: { assetUuid: 'a-3' },
            layout: 'centered',
            caption: '&lt;b&gt; and :hint[x]',
          },
        },
        {
          type: 'paragraph',
          data: { text: '<b>a</b><b>b</b>, <b>Note:</b><i>x</i>' },
        },
      ],
    });
    expect(
      plan(contentToEditMarkdown(tricky), [], [], tricky.blocks).problems,
    ).toEqual([
      'Nothing to tidy: the text is in order as it stands. Leave no suggestion.',
    ]);
  });

  it('takes comments alone, pointed at their words', () => {
    const result = plan(
      contentToEditMarkdown(entry),
      [],
      [
        { quote: 'выкатил релиз', kind: 'missing', comment: 'Какой версии?' },
        { quote: 'нет такого', kind: 'idea', comment: 'Мимо' },
      ],
    );
    expect(result.problems).toEqual([]);
    expect(result.comments).toEqual([
      {
        at: 2,
        quote: 'выкатил релиз',
        kind: 'missing',
        comment: 'Какой версии?',
      },
      { kind: 'idea', comment: 'Мимо' },
    ]);
    expect(result.dropped).toHaveLength(1);
  });

  it('moves, splits, drops a repeat and adds headings', () => {
    const markdown = [
      '## Работа',
      'С утра чинил билд, ваще не собирался.',
      'К обеду билд **собрался**, выкатил релиз.',
      '## Прогулка',
      'Гуляли в парке.',
      'Видел цаплю у пруда.',
      '::media{asset="a-1" layout="centered" caption="Цапля"}',
    ].join('\n\n');
    const markdownWithAsset = markdown.replace(
      /::media\{[^}]*\}/,
      contentToEditMarkdown({ blocks: [blocks[4]!] }).trim(),
    );
    const result = plan(markdownWithAsset, [
      {
        quote: 'Гуляли в парке',
        reason: 'Повторяет начало абзаца',
        duplicateOf: 'Гуляли в парке',
      },
    ]);
    expect(result.problems).toEqual([]);
    // The lone "Гуляли в парке." stays whole; its twin at the head of the
    // first walk paragraph is the repeat, shown where it would return.
    expect(result.items).toEqual([
      { type: 'heading', text: 'Работа', level: 2 },
      { type: 'block', from: 0 },
      { type: 'block', from: 2 },
      { type: 'heading', text: 'Прогулка', level: 2 },
      { type: 'block', from: 3 },
      {
        type: 'part',
        from: 1,
        offset: 0,
        html: 'Гуляли в парке.',
        removed: { reason: 'Повторяет начало абзаца', duplicateOf: 4 },
      },
      { type: 'part', from: 1, offset: 16, html: 'Видел цаплю у пруда.' },
      { type: 'block', from: 4 },
    ]);
    expect(tidyStats({ items: result.items, comments: [] })).toEqual({
      moved: [1],
      split: [1],
      removed: 1,
      headings: 2,
      comments: 0,
    });

    const tidied = applyTidy(blocks, result)!;
    expect(texts(tidied.blocks)).toEqual([
      'Работа',
      'С утра чинил билд, ваще не собирался.',
      'К обеду билд собрался, выкатил релиз.',
      'Прогулка',
      'Гуляли в парке.',
      'Видел цаплю у пруда.',
      'Цапля',
    ]);
    // Kept blocks are the stored ones; the first piece kept of a split
    // paragraph keeps its id.
    expect(tidied.blocks[1]).toBe(blocks[0]);
    expect(tidied.blocks[4]).toBe(blocks[3]);
    expect(tidied.blocks[5]!.id).toBe('p1');
    expect(tidied.blocks[6]).toBe(blocks[4]);
  });

  it('refuses a rewrite, a silent loss and a dropped picture', () => {
    const rewrite = plan(
      [
        'С утра чинил билд, вообще не собирался.',
        'Гуляли в парке. Видел цаплю у пруда.',
        'К обеду билд **собрался**, выкатил релиз.',
        'Гуляли в парке.',
      ].join('\n\n'),
    );
    expect(rewrite.problems.join(' ')).toContain('С утра чинил билд, вообще');
    expect(rewrite.problems.join(' ')).toContain('never rewrites');
    // The picture is gone too, and the original first paragraph with it.
    expect(rewrite.problems.join(' ')).toContain('contentMedia');
    expect(rewrite.problems.join(' ')).toContain('would disappear');
  });

  it('refuses to drop a group of files, even with a reason', () => {
    const stored = normalizeContentData({
      blocks: [
        ...blocks,
        {
          id: 'g1',
          type: 'contentFileGroup',
          data: {
            title: 'Бумаги',
            items: [{ id: 'f1', asset: { assetUuid: 'a-2' }, title: 'Билет' }],
          },
        },
      ],
    }).blocks;
    const result = plan(
      contentToEditMarkdown({ blocks: blocks.slice(1) }),
      [{ quote: 'Бумаги', reason: 'Повтор' }],
      [],
      stored,
    );
    expect(result.problems.join(' ')).toContain('contentFileGroup');
  });

  it('refuses a split through bold, and a piece dropped without a reason', () => {
    const afterBold = plan(
      [
        'С утра чинил билд, ваще не собирался.',
        'Гуляли в парке. Видел цаплю у пруда.',
        'К обеду билд **собрался**,',
        'выкатил релиз.',
        'Гуляли в парке.',
        contentToEditMarkdown({ blocks: [blocks[4]!] }).trim(),
      ].join('\n\n'),
    );
    expect(afterBold.problems).toEqual([]);

    const silent = plan(
      [
        'С утра чинил билд, ваще не собирался.',
        'Видел цаплю у пруда.',
        'К обеду билд **собрался**, выкатил релиз.',
        'Гуляли в парке.',
        contentToEditMarkdown({ blocks: [blocks[4]!] }).trim(),
      ].join('\n\n'),
    );
    expect(silent.problems).toEqual([
      '"Гуляли в парке." would disappear from its paragraph. Put it back, or list it in removals with the reason it goes.',
    ]);

    const declared = plan(
      [
        'С утра чинил билд, ваще не собирался.',
        'Видел цаплю у пруда.',
        'К обеду билд **собрался**, выкатил релиз.',
        'Гуляли в парке.',
        contentToEditMarkdown({ blocks: [blocks[4]!] }).trim(),
      ].join('\n\n'),
      [{ quote: 'гуляли в парке', reason: 'Сказано ниже' }],
    );
    expect(declared.problems).toEqual([]);
    expect(declared.items[1]).toEqual({
      type: 'part',
      from: 1,
      offset: 0,
      html: 'Гуляли в парке.',
      removed: { reason: 'Сказано ниже' },
    });
  });

  it('keeps a split inside bold out', () => {
    const bold = normalizeContentData({
      blocks: [{ type: 'paragraph', data: { text: '<b>Раз. Два.</b> Три.' } }],
    }).blocks;
    const result = plan('**Раз.**\n\n**Два.** Три.', [], [], bold);
    expect(result.problems.join(' ')).toContain('never rewrites');
  });

  it('keeps every block on its side of a private edge', () => {
    const guarded = normalizeContentData({
      blocks: [
        { type: 'paragraph', data: { text: 'Открыто.' } },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 's1', edge: 'start' },
        },
        { type: 'paragraph', data: { text: 'Только для меня.' } },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 's1', edge: 'end' },
        },
        { type: 'paragraph', data: { text: 'Снова открыто.' } },
      ],
    }).blocks;
    const markdown = contentToEditMarkdown({ blocks: guarded });
    const leaked = markdown
      .replace('Только для меня.', 'Снова открыто.')
      .replace(/Снова открыто\.\s*$/, 'Только для меня.\n');
    const result = plan(leaked, [], [], guarded);
    expect(result.problems.join(' ')).toContain('private edge');

    const inside = markdown.replace(
      'Только для меня.',
      '## Личное\n\nТолько для меня.',
    );
    expect(plan(inside, [], [], guarded).problems).toEqual([]);
  });
});

describe('applying a tidy later', () => {
  const markdown = [
    '## Прогулка',
    'Гуляли в парке. Видел цаплю у пруда.',
    'Гуляли в парке.',
    '## Работа',
    'С утра чинил билд, ваще не собирался.',
    'К обеду билд **собрался**, выкатил релиз.',
    contentToEditMarkdown({ blocks: [blocks[4]!] }).trim(),
  ].join('\n\n');
  const tidy = plan(markdown);

  it('matches a text whose words were fixed in place', () => {
    expect(tidy.problems).toEqual([]);
    const fixed = blocks.map((block) =>
      block.id === 'w1'
        ? {
            ...block,
            data: { text: 'С утра чинил билд, вообще не собирался.' },
          }
        : block,
    );
    expect(alignTidyBase(fixed, tidy.keys)?.changed).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    const tidied = applyTidy(fixed, tidy)!;
    expect(texts(tidied.blocks)[4]).toBe(
      'С утра чинил билд, вообще не собирался.',
    );
  });

  it('gives up on a text with a block added or removed', () => {
    expect(applyTidy(blocks.slice(1), tidy)).toBeUndefined();
    expect(
      applyTidy(
        [...blocks, { type: 'paragraph', data: { text: 'Ещё.' } }],
        tidy,
      ),
    ).toBeUndefined();
  });

  it('follows the owner: a heading renamed or left out, a repeat kept', () => {
    const tidied = applyTidy(blocks, tidy, {
      headings: { 0: 'Парк' },
      skip: [3],
    })!;
    expect(texts(tidied.blocks)).toEqual([
      'Парк',
      'Гуляли в парке. Видел цаплю у пруда.',
      'Гуляли в парке.',
      'С утра чинил билд, ваще не собирался.',
      'К обеду билд собрался, выкатил релиз.',
      'Цапля',
    ]);
  });

  it('keeps a split paragraph whole when asked, or when it changed since', () => {
    const split = plan(
      [
        'Видел цаплю у пруда.',
        'С утра чинил билд, ваще не собирался.',
        'Гуляли в парке.',
        'К обеду билд **собрался**, выкатил релиз.',
        'Гуляли в парке.',
        contentToEditMarkdown({ blocks: [blocks[4]!] }).trim(),
      ].join('\n\n'),
    );
    expect(split.problems).toEqual([]);
    const whole = applyTidy(blocks, split, { whole: [1] })!;
    expect(texts(whole.blocks)[0]).toBe('Гуляли в парке. Видел цаплю у пруда.');
    expect(whole.blocks).toHaveLength(5);

    const changed = blocks.map((block) =>
      block.id === 'p1'
        ? { ...block, data: { text: 'Гуляли в парке. Видели цаплю у пруда.' } }
        : block,
    );
    const later = applyTidy(changed, split)!;
    expect(later.keptWhole).toEqual([1]);
    expect(texts(later.blocks)[0]).toBe(
      'Гуляли в парке. Видели цаплю у пруда.',
    );
  });

  it('names blocks by what they say, not by their ids', () => {
    expect(tidyBlockHash(blocks[0]!)).toBe(
      tidyBlockHash({ ...blocks[0]!, id: 'other' }),
    );
    expect(tidyBlockHash(blocks[0]!)).not.toBe(tidyBlockHash(blocks[1]!));
  });
});
