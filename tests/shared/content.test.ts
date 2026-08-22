import { describe, expect, it } from 'vitest';
import {
  ContentValidationError,
  analyzeContentData,
  buildContentPreview,
  canonicalizeContentData,
  collectContentAssetUuids,
  collectContentExternalLinkUrls,
  contentDataIsSemanticallyEqual,
  contentSemanticKey,
  contentPlainText,
  extractContentAssetRefs,
  normalizeContentData,
  summarizeContentData,
} from '../../shared/content';

describe('content normalization', () => {
  it('requires the strict media layout and canonicalizes inline captions', () => {
    expect(() =>
      normalizeContentData({
        blocks: [
          { type: 'contentMedia', data: { asset: { assetUuid: 'legacy' } } },
        ],
      }),
    ).toThrow(ContentValidationError);

    expect(
      normalizeContentData({
        blocks: [
          {
            type: 'contentMedia',
            data: {
              layout: 'natural',
              asset: { assetUuid: 'media' },
              caption: '  <b>Bold</b>\n<i>italic</i> <script>bad()</script> ',
            },
          },
        ],
      }).blocks[0]?.data,
    ).toEqual({
      layout: 'natural',
      asset: { assetUuid: 'media' },
      caption: '<b>Bold</b> <i>italic</i> bad()',
    });

    expect(
      normalizeContentData({
        blocks: [
          {
            type: 'contentMedia',
            data: {
              layout: 'stretch',
              asset: { assetUuid: 'stretched-media' },
            },
          },
        ],
      }).blocks[0]?.data,
    ).toEqual({
      layout: 'stretch',
      asset: { assetUuid: 'stretched-media' },
      caption: undefined,
    });

    expect(() =>
      normalizeContentData({
        blocks: [
          {
            type: 'contentMedia',
            data: {
              layout: 'wide',
              asset: { assetUuid: 'invalid-media' },
            },
          },
        ],
      }),
    ).toThrow(ContentValidationError);
  });

  it('keeps version and block identity while dropping Editor.js time', () => {
    expect(
      normalizeContentData({
        time: 123,
        version: '2.31.0',
        blocks: [
          { id: 'stable-block', type: 'paragraph', data: { text: 'Text' } },
        ],
      }),
    ).toEqual({
      version: '2.31.0',
      blocks: [
        { id: 'stable-block', type: 'paragraph', data: { text: 'Text' } },
      ],
    });
  });

  it('keeps attachment description in the canonical caption field', () => {
    expect(
      normalizeContentData({
        blocks: [
          {
            type: 'contentAttachment',
            data: {
              asset: { assetUuid: 'attachment' },
              title: '  Research file  ',
              caption: '  Plain description  ',
              description: 'Legacy renderer-only field',
            },
          },
        ],
      }).blocks[0]?.data,
    ).toEqual({
      asset: { assetUuid: 'attachment' },
      title: 'Research file',
      caption: 'Plain description',
    });
  });

  it('ignores Editor.js service metadata when content is unchanged', () => {
    const blocks = [
      {
        id: 'block-1',
        type: 'paragraph',
        data: { text: 'Same content' },
      },
    ];

    expect(
      contentDataIsSemanticallyEqual(
        { time: 1, version: '2.28.0', blocks },
        {
          time: 2,
          version: '2.31.0',
          blocks: [
            {
              data: { text: 'Same content' },
              type: 'paragraph',
              id: 'editor-regenerated-id',
            },
          ],
        },
      ),
    ).toBe(true);
    expect(
      contentDataIsSemanticallyEqual(
        { time: 1, blocks },
        {
          time: 2,
          blocks: [
            {
              ...blocks[0]!,
              data: { text: 'Changed content' },
            },
          ],
        },
      ),
    ).toBe(false);
  });

  it('ignores runtime attributes removed from quote caption links', () => {
    const hydratedCaption =
      '<b>Author</b> <a href="https://example.com/" target="_blank" rel="noopener noreferrer" data-content-link="external">Source</a>';
    const storedCaption =
      '<b>Author</b> <a href="https://example.com/" data-content-link="external">Source</a>';

    expect(
      normalizeContentData({
        blocks: [
          {
            type: 'quote',
            data: { text: 'Quote', caption: hydratedCaption },
          },
        ],
      }).blocks[0]?.data,
    ).toEqual({
      text: 'Quote',
      caption: storedCaption,
      alignment: 'left',
    });
    expect(
      contentDataIsSemanticallyEqual(
        {
          blocks: [
            {
              type: 'quote',
              data: { text: 'Quote', caption: hydratedCaption },
            },
          ],
        },
        {
          blocks: [
            {
              type: 'quote',
              data: { text: 'Quote', caption: storedCaption },
            },
          ],
        },
      ),
    ).toBe(true);
  });

  it('canonicalizes hydrated assets and presentation-only link fields', () => {
    const hydrated = {
      blocks: [
        {
          id: 'media-block',
          type: 'contentMedia',
          data: {
            layout: 'centered',
            asset: {
              assetUuid: 'asset-1',
              assetUrl: '/admin/asset-1',
              size: 42,
              media: { kind: 'image', src: '/image.webp', width: 120 },
            },
          },
        },
        {
          id: 'external-block',
          type: 'externalLink',
          data: {
            url: 'https://example.com/path',
            title: 'Hydrated title',
            faviconMedia: { kind: 'image', src: '/favicon.webp' },
          },
        },
      ],
    };
    const canonical = canonicalizeContentData(hydrated);

    expect(canonical.blocks).toEqual([
      {
        id: 'media-block',
        type: 'contentMedia',
        data: {
          asset: { assetUuid: 'asset-1' },
          layout: 'centered',
          caption: undefined,
        },
      },
      {
        id: 'external-block',
        type: 'externalLink',
        data: { url: 'https://example.com/path' },
      },
    ]);
    expect(contentSemanticKey(hydrated)).toBe(
      contentSemanticKey({
        blocks: [
          {
            id: 'different-block-id',
            type: 'contentMedia',
            data: {
              layout: 'centered',
              asset: { assetUuid: 'asset-1' },
            },
          },
          {
            type: 'externalLink',
            data: { url: 'https://example.com/path' },
          },
        ],
      }),
    );
  });

  it('collects and deduplicates block and inline external URLs', () => {
    expect(
      collectContentExternalLinkUrls({
        blocks: [
          {
            type: 'externalLink',
            data: { url: 'https://example.com/path' },
          },
          {
            type: 'paragraph',
            data: {
              text: 'One <a href="https://example.com/path" data-content-link="external">same</a> and <a href="https://other.example/" data-content-link="external">other</a>',
            },
          },
        ],
      }),
    ).toEqual(['https://example.com/path', 'https://other.example/']);
  });

  it('drops empty text blocks and keeps meaningful blocks', () => {
    const data = normalizeContentData({
      blocks: [
        { type: 'paragraph', data: { text: '   ' } },
        { type: 'header', data: { text: 'Project', level: 3 } },
      ],
    });

    expect(data.blocks).toEqual([
      { type: 'header', data: { text: 'Project', level: 3 } },
    ]);
  });

  it('drops incomplete entity links and canonicalizes selected targets', () => {
    const data = normalizeContentData({
      blocks: [
        { id: 'empty-link', type: 'entityLink', data: {} },
        {
          id: 'partial-link',
          type: 'entityLink',
          data: { entityType: 'project' },
        },
        {
          id: 'selected-link',
          type: 'entityLink',
          data: { entityType: 'event', entityId: '  event-1  ' },
        },
      ],
    });

    expect(data.blocks).toEqual([
      {
        id: 'selected-link',
        type: 'entityLink',
        data: { entityType: 'event', entityId: 'event-1' },
      },
    ]);
  });

  it('keeps semantic delimiters with no decorative data', () => {
    const data = normalizeContentData({
      blocks: [
        {
          id: 'delimiter-1',
          type: 'delimiter',
          data: { text: '* * *', presentation: 'legacy' },
        },
      ],
    });

    expect(data.blocks).toEqual([
      { id: 'delimiter-1', type: 'delimiter', data: {} },
    ]);
    expect(contentPlainText(data)).toBe('');
    expect(summarizeContentData(data)).toEqual({
      blockCount: 1,
      wordCount: 0,
      assetCount: 0,
      assetTotalSize: 0,
    });
  });

  it('allows only canonical heading and subheading levels', () => {
    const data = normalizeContentData({
      blocks: [
        { type: 'header', data: { text: 'Heading', level: 4 } },
        { type: 'header', data: { text: 'Subheading', level: 3 } },
      ],
    });

    expect(data.blocks.map((block) => block.data.level)).toEqual([2, 3]);
  });

  it('rejects unsupported block types', () => {
    expect(() =>
      normalizeContentData({
        blocks: [{ type: 'raw', data: { html: '<script></script>' } }],
      }),
    ).toThrow(ContentValidationError);
  });

  it('keeps inline formatting html in text blocks', () => {
    const data = normalizeContentData({
      blocks: [
        {
          type: 'paragraph',
          data: { text: 'Text with <i>italic</i> and <em>emphasis</em>' },
        },
      ],
    });

    expect(data.blocks[0]?.data).toEqual({
      text: 'Text with <i>italic</i> and <em>emphasis</em>',
    });
  });

  it('keeps headers strictly plain text', () => {
    const data = normalizeContentData({
      blocks: [
        {
          type: 'header',
          data: {
            text: '<b>Heading</b><br><a href="https://example.com">A &amp; B</a>',
            level: 2,
          },
        },
      ],
    });

    expect(data.blocks[0]?.data).toEqual({
      text: 'Heading A &amp; B',
      level: 2,
    });
  });

  it('extracts asset refs with private block tune', () => {
    const data = normalizeContentData({
      blocks: [
        {
          id: 'block-1',
          type: 'contentMedia',
          data: { layout: 'centered', asset: { assetUuid: 'a-1', size: 10 } },
          tunes: { privateAccess: { isPrivate: true } },
        },
        {
          id: 'block-2',
          type: 'contentGallery',
          data: {
            items: [
              {
                id: 'item-1',
                asset: { assetUuid: 'a-1', size: 10 },
                caption: 'First',
              },
              {
                id: 'item-2',
                asset: { assetUuid: 'a-2', size: 20 },
              },
            ],
          },
        },
      ],
    });

    expect(extractContentAssetRefs(data)).toEqual([
      {
        assetUuid: 'a-1',
        blockId: 'block-1',
        blockType: 'contentMedia',
        isPrivate: true,
      },
      {
        assetUuid: 'a-1',
        blockId: 'block-2',
        blockType: 'contentGallery',
        isPrivate: false,
      },
      {
        assetUuid: 'a-2',
        blockId: 'block-2',
        blockType: 'contentGallery',
        isPrivate: false,
      },
    ]);
    expect(collectContentAssetUuids(data)).toEqual(['a-1', 'a-2']);
  });

  it('extracts all user-facing text from structured blocks', () => {
    const data = normalizeContentData({
      blocks: [
        {
          type: 'quote',
          data: { text: '<b>Main quote</b>', caption: 'Author&nbsp;name' },
        },
        {
          type: 'contentMedia',
          data: {
            layout: 'centered',
            asset: { assetUuid: 'a-1' },
            caption: 'Media caption',
          },
        },
        {
          type: 'contentGallery',
          data: {
            items: [
              {
                id: 'item-1',
                asset: { assetUuid: 'a-2' },
                caption: 'Gallery caption',
              },
            ],
          },
        },
        {
          type: 'contentAttachment',
          data: {
            asset: { assetUuid: 'a-3' },
            title: 'Research file',
            caption: 'Attachment caption',
          },
        },
        { type: 'externalLink', data: { url: 'https://example.com' } },
      ],
    });

    expect(contentPlainText(data)).toBe(
      'Main quote Author name Media caption Gallery caption Research file Attachment caption https://example.com/',
    );
  });

  it('keeps only per-item captions in galleries', () => {
    const data = normalizeContentData({
      blocks: [
        {
          type: 'contentGallery',
          data: {
            caption: 'This field is not part of the gallery format',
            items: [
              {
                id: 'item-1',
                asset: { assetUuid: 'a-1' },
                caption: 'Item caption',
              },
            ],
          },
        },
      ],
    });

    expect(data.blocks[0]?.data).toEqual({
      items: [
        {
          id: 'item-1',
          asset: { assetUuid: 'a-1' },
          caption: 'Item caption',
        },
      ],
    });
  });

  it('normalizes gallery captions as safe single-line inline HTML', () => {
    const source = {
      blocks: [
        {
          id: 'gallery-block',
          type: 'contentGallery',
          data: {
            items: [
              {
                id: 'gallery-item',
                asset: { assetUuid: 'a-1' },
                caption:
                  '  <strong>Bold</strong>\n<em>italic</em><br><a href="https://EXAMPLE.com/source" onclick="bad()">source</a><script>bad()</script> ',
              },
            ],
          },
        },
      ],
    };
    const normalized = normalizeContentData(source);

    expect(normalized.blocks[0]?.data).toEqual({
      items: [
        {
          id: 'gallery-item',
          asset: { assetUuid: 'a-1' },
          caption:
            '<strong>Bold</strong> <em>italic</em> <a href="https://example.com/source" data-content-link="external">source</a>bad()',
        },
      ],
    });
    expect(contentPlainText(normalized)).toBe('Bold italic sourcebad()');
    expect(summarizeContentData(normalized)).toMatchObject({
      blockCount: 1,
      wordCount: 3,
      assetCount: 1,
    });
    expect(contentDataIsSemanticallyEqual(source, normalized)).toBe(true);
  });

  it('drops an empty gallery block during normalization', () => {
    expect(
      normalizeContentData({
        blocks: [
          { id: 'empty-gallery', type: 'contentGallery', data: { items: [] } },
        ],
      }).blocks,
    ).toEqual([]);
  });

  it('deduplicates asset sizes in summary', () => {
    const data = normalizeContentData({
      blocks: [
        {
          type: 'contentAttachment',
          data: { asset: { assetUuid: 'a-1' } },
        },
        {
          type: 'contentMedia',
          data: { layout: 'centered', asset: { assetUuid: 'a-1' } },
        },
      ],
    });

    expect(summarizeContentData(data, new Map([['a-1', 100]]))).toEqual({
      blockCount: 2,
      wordCount: 0,
      assetCount: 1,
      assetTotalSize: 100,
    });
  });

  it('converts list meta proxies to structured-cloneable plain objects', () => {
    const data = normalizeContentData({
      blocks: [
        {
          type: 'list',
          data: {
            style: 'checklist',
            meta: new Proxy({ start: 2 }, {}),
            items: [
              {
                content: 'Done',
                meta: new Proxy({ checked: true }, {}),
                items: [],
              },
            ],
          },
        },
      ],
    });

    expect(() => structuredClone(data.blocks[0]!.data)).not.toThrow();
    expect(data.blocks[0]!.data).toEqual({
      style: 'checklist',
      meta: { start: 2 },
      items: [{ content: 'Done', meta: { checked: true }, items: [] }],
    });
  });
});

describe('content preview', () => {
  const imageMedia = {
    kind: 'image' as const,
    src: '/image.webp',
    previewSrc: '/image-preview.webp',
  };
  const videoMedia = {
    kind: 'video' as const,
    src: '/video.mp4',
    previewSrc: '/video-preview.webp',
  };

  it('collects formatted text and nested list items in block order', () => {
    const preview = buildContentPreview({
      blocks: [
        { type: 'header', data: { text: '<b>Heading</b>' } },
        { type: 'paragraph', data: { text: 'Text&nbsp; with   spaces' } },
        {
          type: 'list',
          data: {
            items: [
              {
                content: 'Parent',
                items: [{ content: '<i>Child</i>', items: [] }],
              },
            ],
          },
        },
        { type: 'quote', data: { text: 'Quote', caption: 'Ignored' } },
      ],
    });

    expect(preview.text).toBe('Heading Text with spaces Parent Child Quote');
  });

  it('limits normalized text to 200 characters', () => {
    const preview = buildContentPreview({
      blocks: [{ type: 'paragraph', data: { text: 'a'.repeat(240) } }],
    });

    expect(preview.text).toHaveLength(200);
  });

  it('decodes html entities and keeps grapheme clusters intact', () => {
    const preview = buildContentPreview(
      {
        blocks: [
          {
            type: 'paragraph',
            data: { text: '&quot;A&amp;B&quot; 👩‍💻e\u0301Z' },
          },
        ],
      },
      10,
    );

    expect(preview.text).toBe('"A&B" 👩‍💻éZ');
  });

  it('returns normalized data, preview, and summary from one analysis', () => {
    const analysis = analyzeContentData({
      blocks: [
        { type: 'paragraph', data: { text: '<b>Preview</b>' } },
        {
          type: 'contentMedia',
          data: {
            layout: 'centered',
            asset: { assetUuid: 'a-image', size: 42, media: imageMedia },
          },
        },
      ],
    });

    expect(analysis.preview).toEqual({ text: 'Preview', media: imageMedia });
    expect(analysis.summary).toEqual({
      blockCount: 2,
      wordCount: 1,
      assetCount: 1,
      assetTotalSize: 42,
    });
  });

  it('counts all visible text except external URLs', () => {
    const summary = summarizeContentData({
      blocks: [
        {
          type: 'header',
          data: { text: '<b>Заголовок&nbsp;один</b>' },
        },
        {
          type: 'list',
          data: {
            items: [
              {
                content: 'Пункт — два!',
                items: [{ content: 'nested-item', items: [] }],
              },
            ],
          },
        },
        {
          type: 'quote',
          data: { text: 'Цитата', caption: 'Автор' },
        },
        {
          type: 'contentMedia',
          data: {
            layout: 'centered',
            asset: { assetUuid: 'media' },
            caption: 'Подпись медиа',
          },
        },
        {
          type: 'contentGallery',
          data: {
            items: [
              {
                id: 'gallery-item',
                asset: { assetUuid: 'gallery' },
                caption: 'Подпись галереи',
              },
            ],
          },
        },
        {
          type: 'contentAttachment',
          data: {
            asset: { assetUuid: 'file' },
            title: 'Название файла',
            caption: 'Описание файла',
          },
        },
        {
          type: 'externalLink',
          data: { url: 'https://example.com/two-words' },
        },
      ],
    });

    expect(summary.wordCount).toBe(15);
  });

  it('uses the first media in block and gallery order', () => {
    const preview = buildContentPreview({
      blocks: [
        {
          type: 'contentGallery',
          data: {
            items: [
              { id: 'missing', asset: { assetUuid: 'a-missing' } },
              {
                id: 'video',
                asset: { assetUuid: 'a-video', media: videoMedia },
              },
            ],
          },
        },
        {
          type: 'contentMedia',
          data: {
            layout: 'centered',
            asset: { assetUuid: 'a-image', media: imageMedia },
          },
        },
      ],
    });

    expect(preview.media).toEqual(videoMedia);
  });

  it('returns no text or media for non-preview content', () => {
    expect(
      buildContentPreview({
        blocks: [
          {
            type: 'contentAttachment',
            data: { asset: { assetUuid: 'a-file' }, caption: 'Ignored' },
          },
          { type: 'externalLink', data: { url: 'https://example.com' } },
        ],
      }),
    ).toEqual({ text: '' });
  });
});
