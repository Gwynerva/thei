import { describe, expect, it } from 'vitest';
import {
  contentSemanticKey,
  normalizeContentData,
} from '#layers/thei/shared/content';
import { mergeEditedBlocks } from '#layers/thei/shared/content-edit-markdown/merge';
import { parseEditMarkdownToBlocks } from '#layers/thei/shared/content-edit-markdown/parse';
import { contentToEditMarkdown } from '#layers/thei/shared/content-edit-markdown/serialize';

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
        title: 'Арена',
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
        caption: 'Запись с <b>прогулки</b>',
      },
    },
    {
      type: 'contentAttachment',
      data: { asset: asset('a-5'), title: 'Документ' },
    },
    {
      type: 'contentFileGroup',
      data: {
        title: 'Бумаги',
        items: [
          {
            id: 'f1',
            asset: asset('a-6'),
            title: 'Договор',
            caption: 'Подписан <a href="https://example.com/">здесь</a>',
          },
          { id: 'f2', asset: asset('a-7') },
        ],
      },
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

:::gallery{title="Арена"}
::media[раз]{#g1 asset="a-2"}

::media{#g2 asset="a-3"}
:::

::audio[Запись с **прогулки**]{asset="a-4" title="Голос"}

::file{asset="a-5" title="Документ"}

:::files{title="Бумаги"}
::file[Подписан [здесь](https://example.com/)]{#f1 asset="a-6" title="Договор"}

::file{#f2 asset="a-7"}
:::

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

  it('reads a file’s caption written when it was plain text as the same words', () => {
    // What an action kept from before captions took markup: a plain caption,
    // escaped as Markdown escapes words.
    const parsed = parseEditMarkdownToBlocks(
      '::file[Q1 < Q2 & a \\*star\\* \\[1\\]]{asset="a-1" title="Prices"}',
    );
    expect(parsed.warnings).toEqual([]);
    expect(parsed.blocks).toMatchObject([
      {
        type: 'contentAttachment',
        data: { title: 'Prices', caption: 'Q1 &lt; Q2 &amp; a *star* [1]' },
      },
    ]);
  });

  it('gives a copied file line an id of its own', () => {
    const { blocks } = normalizeContentData({
      blocks: parseEditMarkdownToBlocks(
        ':::files\n::file[One]{#f1 asset="a-1"}\n\n::file[Copy]{#f1 asset="a-1"}\n:::',
      ).blocks,
    } as never);
    expect(
      (blocks[0]!.data.items as { id: string; caption: string }[]).map(
        ({ id, caption }) => [id, caption],
      ),
    ).toEqual([
      ['f1', 'One'],
      ['f1-2', 'Copy'],
    ]);
  });

  it('reads a recording in a group as a file of it', () => {
    const parsed = parseEditMarkdownToBlocks(
      ':::files\n::audio[Голос]{#r asset="a-1"}\n\n::media{asset="a-2"}\n:::',
    );
    expect(parsed.blocks).toMatchObject([
      {
        type: 'contentFileGroup',
        data: {
          title: '',
          items: [{ id: 'r', asset: { assetUuid: 'a-1' }, caption: 'Голос' }],
        },
      },
    ]);
  });
});

describe('editing markdown: words that look like syntax', () => {
  const BACKSLASH = '\\';
  /** Inline markup whose every character means something to Markdown. */
  const tricky = [
    ':hint[x]{note="y"} literal',
    ':start',
    'a::b and a :b',
    'at 10:30, a ratio of 3:2',
    '*stars* _under_ `code` ~~no~~ ~one~',
    '&amp;lt;b&amp;gt; not bold &amp;amp; &amp;#91;',
    '&lt;b&gt;not a tag&lt;/b&gt;',
    '![not](a picture) and [not](a link)',
    '# not a heading',
    '&gt; not a quote',
    '- not a list',
    '1. not a list',
    '---',
    '::media{asset="a-1"}',
    ':::private',
    '[not](a link)',
    '&amp;amp; stays an ampersand and a word',
    `a${BACKSLASH}b ends ${BACKSLASH}`,
    'x {a=1} } {#id}',
    'a [b] c ] d [ e',
    'see <abbr data-content-hint="RFC [draft">spec</abbr> and <abbr data-content-hint="] *x* :hint[y]">term</abbr>',
    'see <a href="https://example.com/a(b)" data-content-link="external" data-content-note="why [1] ] *so*">link [1]</a>',
    '<a data-content-link="entity" data-entity-type="project" data-entity-id="p-1" data-content-note="see ]">the game</a>',
  ];
  /** Plain words, as a title or a link block's note holds them. */
  const plain = [
    ':hint[x]{note="y"}',
    '*x* _y_ `z` ~~w~~',
    'a ] b [ c } d {',
    'T "q" &amp; it’s',
    'a &lt;b&gt; &amp;lt;',
    `x${BACKSLASH}y`,
    '#1',
    '1:58, at 10:30, Note:this',
  ];

  function readBack(blocks: unknown[]) {
    const stored = normalizeContentData({ blocks } as never);
    const parsed = parseEditMarkdownToBlocks(contentToEditMarkdown(stored));
    const written = normalizeContentData({ blocks: parsed.blocks } as never);
    return {
      stored: stored.blocks,
      written: written.blocks,
      merged: mergeEditedBlocks(stored.blocks, written.blocks),
      warnings: parsed.warnings,
    };
  }

  const fileBlocks = (caption: string) => [
    {
      type: 'contentMedia',
      data: { asset: asset('a-1'), layout: 'centered', caption },
    },
    {
      type: 'contentGallery',
      data: {
        title: 'Pictures',
        items: [
          { id: 'g1', asset: asset('a-2'), caption },
          { id: 'g2', asset: asset('a-3'), caption: 'second' },
        ],
      },
    },
    {
      type: 'contentAudio',
      data: { asset: asset('a-4'), title: 'Voice', caption },
    },
    {
      type: 'contentAttachment',
      data: { asset: asset('a-5'), title: 'Paper', caption },
    },
    {
      type: 'contentFileGroup',
      data: {
        title: 'Papers',
        items: [
          { id: 'f1', asset: asset('a-6'), title: 'One', caption },
          { id: 'f2', asset: asset('a-7'), title: 'Two', caption: 'second' },
        ],
      },
    },
    { type: 'quote', data: { text: 'Words', caption, alignment: 'left' } },
    { type: 'paragraph', data: { text: caption } },
  ];

  it.each(tricky)('reads every caption back as it was: %s', (caption) => {
    const { stored, written, merged, warnings } = readBack(fileBlocks(caption));
    expect(warnings).toEqual([]);
    expect(written.map((block) => block.data)).toEqual(
      stored.map((block) => block.data),
    );
    expect(merged).toEqual(stored);
  });

  it.each(plain)('reads every title and note back as it was: %s', (words) => {
    const { stored, written, warnings } = readBack([
      { type: 'header', data: { text: words, level: 2 } },
      { type: 'contentAudio', data: { asset: asset('a-1'), title: words } },
      {
        type: 'contentAttachment',
        data: { asset: asset('a-2'), title: words },
      },
      {
        type: 'contentGallery',
        data: { title: words, items: [{ id: 'g1', asset: asset('a-3') }] },
      },
      {
        type: 'contentFileGroup',
        data: {
          title: words,
          items: [{ id: 'f1', asset: asset('a-4'), title: words }],
        },
      },
      {
        type: 'externalLink',
        data: { url: 'https://example.com/', note: words },
      },
      {
        type: 'entityLink',
        data: { entityType: 'event', entityId: 'e-1', note: words },
      },
    ]);
    expect(warnings).toEqual([]);
    expect(written.map((block) => block.data)).toEqual(
      stored.map((block) => block.data),
    );
  });

  it('keeps a group whole when a caption’s hint has a bracket in its note', () => {
    const { stored, merged } = readBack([
      {
        id: 'group',
        type: 'contentFileGroup',
        data: {
          title: 'Docs',
          items: [
            {
              id: 'f1',
              asset: asset('a-1'),
              title: 'One',
              caption: 'see <abbr data-content-hint="RFC [draft">spec</abbr>',
            },
            { id: 'f2', asset: asset('a-2'), title: 'Two', caption: 'kept' },
          ],
        },
      },
      {
        id: 'lone',
        type: 'contentAttachment',
        data: {
          asset: asset('a-3'),
          caption: 'see <abbr data-content-hint="a ] b">spec</abbr>',
        },
      },
    ]);
    expect(merged).toEqual(stored);
  });
});

describe('editing markdown: marks side by side', () => {
  function roundTrip(text: string) {
    const stored = normalizeContentData({
      blocks: [{ id: 'p', type: 'paragraph', data: { text } }],
    });
    const markdown = contentToEditMarkdown(stored);
    const written = normalizeContentData({
      blocks: parseEditMarkdownToBlocks(markdown).blocks,
    } as never).blocks;
    return {
      markdown,
      text: written[0]?.data.text,
      merged: mergeEditedBlocks(stored.blocks, written),
      stored: stored.blocks,
    };
  }

  it('writes two of the same mark side by side as one', () => {
    for (const [text, markdown] of [
      ['<b>a</b><b>b</b>', '**ab**'],
      ['<i>a</i><i>b</i>', '*ab*'],
      ['<s>a</s><s>b</s>', '~~ab~~'],
      ['<i><b>a</b></i><i><b>b</b></i>', '***ab***'],
    ] as const) {
      const result = roundTrip(text);
      expect(result.markdown).toBe(markdown);
      // What was stored stays: the two read the same.
      expect(result.merged).toEqual(result.stored);
    }
  });

  it('writes marks as tags where their stars would run together', () => {
    for (const text of [
      '<b>Note:</b><i>text</i>',
      '<b><i>a</i></b><i>b</i>',
      'é<s>:x</s>',
      '<b>Ура!</b>🎉 и 😀<i>.x</i>',
      'a<br><b>Note:</b><i>text</i>',
    ]) {
      const result = roundTrip(text);
      expect(result.markdown).toContain('<');
      expect(result.text).toBe(text);
    }
    expect(roundTrip('<b>Note:</b><i>text</i>').markdown).toBe(
      '<b>Note:</b><i>text</i>',
    );
  });

  it('keeps stars where they read back as they are', () => {
    expect(roundTrip('<b>bold</b><i>italic</i> and <s>gone</s>').markdown).toBe(
      '**bold***italic* and ~~gone~~',
    );
  });

  it('never reads a colon after a mark as a hint', () => {
    for (const text of ['<b>:hint</b>', '<b>a</b>:hint x', '<i>:hint[x]</i>'])
      expect(roundTrip(text).text).toBe(text);
  });

  it('keeps a hint inside a hint whose note has a bracket', () => {
    const text =
      '<abbr data-content-hint="outer">a <abbr data-content-hint="x ] y">b</abbr></abbr>';
    expect(roundTrip(text).text).toBe(text);
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
