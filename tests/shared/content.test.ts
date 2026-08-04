import { describe, expect, it } from 'vitest';
import {
  ContentValidationError,
  analyzeContentData,
  buildContentPreview,
  collectContentAssetUuids,
  contentDataIsSemanticallyEqual,
  contentPlainText,
  extractContentAssetRefs,
  normalizeContentData,
  summarizeContentData,
} from '../../shared/content';

describe('content normalization', () => {
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

  it('extracts asset refs with private block tune', () => {
    const data = normalizeContentData({
      blocks: [
        {
          id: 'block-1',
          type: 'contentMedia',
          data: { asset: { assetUuid: 'a-1', size: 10 } },
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

  it('deduplicates asset sizes in summary', () => {
    const data = normalizeContentData({
      blocks: [
        {
          type: 'contentAttachment',
          data: { asset: { assetUuid: 'a-1' } },
        },
        {
          type: 'contentMedia',
          data: { asset: { assetUuid: 'a-1' } },
        },
      ],
    });

    expect(summarizeContentData(data, new Map([['a-1', 100]]))).toEqual({
      blockCount: 2,
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
            asset: { assetUuid: 'a-image', size: 42, media: imageMedia },
          },
        },
      ],
    });

    expect(analysis.preview).toEqual({ text: 'Preview', media: imageMedia });
    expect(analysis.summary).toEqual({
      blockCount: 2,
      assetCount: 1,
      assetTotalSize: 42,
    });
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
          data: { asset: { assetUuid: 'a-image', media: imageMedia } },
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
