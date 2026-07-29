import { describe, expect, it } from 'vitest';
import {
  ContentValidationError,
  contentDataIsSemanticallyEqual,
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
