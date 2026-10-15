import { describe, expect, it } from 'vitest';
import {
  contentSemanticKey,
  normalizeContentData,
} from '#layers/thei/shared/content';
import { mergeEditedBlocks } from '#layers/thei/shared/content-edit-markdown/merge';
import { parseEditMarkdownToBlocks } from '#layers/thei/shared/content-edit-markdown/parse';
import { contentToEditMarkdown } from '#layers/thei/shared/content-edit-markdown/serialize';
import { parseEditMarkdown } from '#layers/thei/shared/content-edit-markdown/syntax';

const asset = (assetUuid: string) => ({ assetUuid });

const everyBlock = normalizeContentData({
  blocks: [
    { type: 'header', data: { text: 'Босс &amp; арена', level: 2 } },
    {
      type: 'paragraph',
      data: {
        text:
          'Сегодня <b>наконец</b> доделал <i>босса</i> — <s>тепер</s> ' +
          '<a data-content-link="entity" data-entity-type="project" data-entity-id="p-1" data-content-note="Игра">Парапет</a>, ' +
          '<a href="https://example.com/a?b=1" data-content-link="external">сайт</a> и ' +
          '<abbr data-content-hint="пояснение">термин</abbr>.<br>Строка 2 *звёздочка* _подчерк_ [скобки] # 1. &lt;tag&gt; &amp;copy; :hint',
      },
    },
    { type: 'header', data: { text: 'Подзаголовок', level: 3 } },
    {
      type: 'quote',
      data: { text: 'Просто цитата', caption: '', alignment: 'left' },
    },
    {
      type: 'quote',
      data: { text: 'Цитата', caption: 'Автор', alignment: 'center' },
    },
    {
      type: 'list',
      data: {
        style: 'ordered',
        meta: { start: 3, counterType: 'numeric' },
        items: [
          {
            content: 'первый',
            meta: {},
            items: [{ content: 'вложенный', meta: {}, items: [] }],
          },
          { content: 'второй', meta: {}, items: [] },
        ],
      },
    },
    {
      type: 'list',
      data: {
        style: 'checklist',
        meta: {},
        items: [
          { content: 'сделано', meta: { checked: true }, items: [] },
          { content: 'не сделано', meta: { checked: false }, items: [] },
        ],
      },
    },
    { type: 'delimiter', data: {} },
    {
      type: 'contentMedia',
      data: {
        asset: asset('a-1'),
        layout: 'centered',
        caption: 'Кадр <b>босса</b>',
      },
    },
    {
      type: 'contentGallery',
      data: {
        items: [
          { id: 'g1', asset: asset('a-2'), caption: 'раз' },
          { id: 'g2', asset: asset('a-3') },
        ],
      },
    },
    {
      type: 'contentAudio',
      data: {
        asset: asset('a-4'),
        title: 'Голос',
        caption: 'Запись с прогулки',
      },
    },
    {
      type: 'contentAttachment',
      data: { asset: asset('a-5'), title: 'Документ' },
    },
    {
      type: 'externalLink',
      data: { url: 'https://example.com/', note: 'Почему ссылка' },
    },
    {
      type: 'entityLink',
      data: {
        entityType: 'event',
        entityId: 'e-1',
        fragment: 'top',
        note: 'См. событие',
      },
    },
    {
      type: 'integration',
      data: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', start: 42 },
    },
    {
      type: 'privateSectionBoundary',
      data: { sectionId: 'ps1', edge: 'start' },
    },
    {
      type: 'paragraph',
      data: { text: 'Только для меня' },
      tunes: { spoiler: true },
    },
    { type: 'paragraph', data: { text: 'И это тоже скрыто' } },
    { type: 'privateSectionBoundary', data: { sectionId: 'ps1', edge: 'end' } },
    {
      type: 'paragraph',
      data: { text: 'Спойлер снаружи' },
      tunes: { spoiler: true },
    },
  ],
});

describe('editing markdown: serialize', () => {
  it('writes every block type, nothing left out', () => {
    expect(contentToEditMarkdown(everyBlock)).toBe(`## Босс & арена

Сегодня **наконец** доделал *босса* — ~~тепер~~ [Парапет](thei:project/p-1 "Игра"), [сайт](https://example.com/a?b=1) и :hint[термин]{note="пояснение"}.\\
Строка 2 \\*звёздочка\\* \\_подчерк\\_ \\[скобки] # 1. \\<tag> \\&copy; \\:hint

### Подзаголовок

> Просто цитата

:::quote[Автор]{align="center"}
Цитата
:::

3. первый
   1. вложенный
4. второй

- [x] сделано
- [ ] не сделано

---

::media[Кадр **босса**]{asset="a-1" layout="centered"}

:::gallery
::media[раз]{#g1 asset="a-2"}

::media{#g2 asset="a-3"}
:::

::audio[Запись с прогулки]{asset="a-4" title="Голос"}

::file{asset="a-5" title="Документ"}

::link[Почему ссылка]{url="https://example.com/"}

::card[См. событие]{to="thei:event/e-1#top"}

::embed{url="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"}

::::private{#ps1}
:::spoiler
Только для меня
:::

И это тоже скрыто
::::

:::spoiler
Спойлер снаружи
:::`);
  });

  it('keeps words that look like syntax as words', () => {
    const tricky = [
      '1. not a list',
      '- not a bullet',
      '# not a heading',
      '---',
      '&gt; not a quote',
      '::media{asset="a-1"}',
      ':::private',
      '[not](a link)',
      '&amp;amp; stays an ampersand and a word',
    ];
    const markdown = contentToEditMarkdown(
      normalizeContentData({
        blocks: tricky.map((text) => ({ type: 'paragraph', data: { text } })),
      }),
    );
    const root = parseEditMarkdown(markdown);
    expect(root.children.map((node) => node.type)).toEqual(
      tricky.map(() => 'paragraph'),
    );
  });

  it('drops a line break that ends a text, which no Markdown can write', () => {
    expect(
      contentToEditMarkdown(
        normalizeContentData({
          blocks: [{ type: 'paragraph', data: { text: 'last line<br>' } }],
        }),
      ),
    ).toBe('last line');
  });

  it('reads back into the very same document', () => {
    const parsed = parseEditMarkdownToBlocks(contentToEditMarkdown(everyBlock));
    expect(parsed.warnings).toEqual([]);
    expect(contentSemanticKey({ blocks: parsed.blocks } as never)).toBe(
      contentSemanticKey(everyBlock),
    );
  });

  it('drops nothing a multi-line hint holds', () => {
    const data = normalizeContentData({
      blocks: [
        {
          type: 'paragraph',
          data: {
            text: 'A <abbr data-content-hint="first&#10;&#10;second &amp;copy;">word</abbr>.',
          },
        },
      ],
    });
    const parsed = parseEditMarkdownToBlocks(contentToEditMarkdown(data));
    expect(contentSemanticKey({ blocks: parsed.blocks } as never)).toBe(
      contentSemanticKey(data),
    );
  });

  it('writes nothing for an empty text', () => {
    expect(contentToEditMarkdown(null)).toBe('');
    expect(contentToEditMarkdown({ blocks: [] })).toBe('');
  });
});

describe('editing markdown: links to this site', () => {
  it('keeps the words of an address that names nothing, and says so', () => {
    const parsed = parseEditMarkdownToBlocks(
      'See [the profile](thei:profile) and [the walk](thei:event/e-1).',
    );
    expect(parsed.blocks[0]!.data).toEqual({
      text:
        'See the profile and <a data-content-link="entity" ' +
        'data-entity-type="event" data-entity-id="e-1">the walk</a>.',
    });
    expect(parsed.warnings).toEqual([
      'thei:profile names nothing on the site: its words were kept without the link. Write thei:<kind>/<id>.',
    ]);
  });
});

describe('editing markdown: private parts', () => {
  it('keeps a private part private inside a spoiler', () => {
    const { blocks } = parseEditMarkdownToBlocks(
      [
        ':::::spoiler',
        'Open words',
        '',
        '::::private{#s1}',
        'Secret words',
        '::::',
        ':::::',
      ].join('\n'),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'privateSectionBoundary',
      'paragraph',
      'privateSectionBoundary',
    ]);
    expect(blocks[2]).toMatchObject({
      data: { text: 'Secret words' },
      tunes: { spoiler: true },
    });
  });
});

describe('editing markdown: merge', () => {
  const stored = normalizeContentData({
    blocks: [
      {
        id: 'keep1',
        type: 'paragraph',
        data: { text: 'One <strong>bold</strong> word.' },
      },
      { id: 'edit1', type: 'paragraph', data: { text: 'A tpyo here.' } },
      { id: 'keep2', type: 'header', data: { text: 'Heading', level: 2 } },
      { id: 'gone1', type: 'paragraph', data: { text: 'Removed.' } },
    ],
  });

  function written(markdown: string) {
    return normalizeContentData({
      blocks: parseEditMarkdownToBlocks(markdown).blocks,
    } as never).blocks;
  }

  it('keeps every untouched block exactly as stored', () => {
    const merged = mergeEditedBlocks(
      stored.blocks,
      written(contentToEditMarkdown(stored)),
    );
    expect(merged).toEqual(stored.blocks);
  });

  it('takes only what changed from what was written', () => {
    const markdown = contentToEditMarkdown(stored)
      .replace('tpyo', 'typo')
      .replace('Removed.', '')
      .concat('\n\nAdded at the end.');
    const merged = mergeEditedBlocks(stored.blocks, written(markdown));
    expect(merged.map((block) => block.id?.length === 10 || block.id)).toEqual([
      'keep1',
      true,
      'keep2',
      true,
    ]);
    // The stored `<strong>` survives: that block was not touched.
    expect(merged[0]!.data.text).toBe('One <strong>bold</strong> word.');
    expect(merged[1]!.data.text).toBe('A typo here.');
    expect(merged[3]!.data.text).toBe('Added at the end.');
  });
});
