import { describe, expect, it } from 'vitest';
import {
  contentAssetSelectionChanged,
  contentAttachmentAssetChanged,
  contentAttachmentSuggestedTitle,
  normalizeContentAttachmentPaste,
} from '../../../app/components/content/content-attachment';

describe('content attachment state', () => {
  it('suggests a readable title only when the source name is available', () => {
    expect(
      contentAttachmentSuggestedTitle({
        assetUuid: 'asset-document',
        name: 'research.notes.pdf',
        extension: 'pdf',
      }),
    ).toBe('research.notes');
    expect(
      contentAttachmentSuggestedTitle({
        assetUuid: 'asset-pdf',
        extension: 'pdf',
      }),
    ).toBeUndefined();
  });

  it('treats replacement with the same asset as a presentation-only refresh', () => {
    expect(
      contentAttachmentAssetChanged(
        { assetUuid: 'same', extension: 'txt' },
        { assetUuid: 'same', extension: 'txt', size: 12 },
      ),
    ).toBe(false);
    expect(
      contentAttachmentAssetChanged(
        { assetUuid: 'before' },
        { assetUuid: 'after' },
      ),
    ).toBe(true);
    expect(
      contentAssetSelectionChanged(
        { assetUuid: 'same', media: { kind: 'image', src: '/old' } },
        { assetUuid: 'same', media: { kind: 'image', src: '/new' } },
      ),
    ).toBe(false);
    expect(contentAssetSelectionChanged({ assetUuid: 'same' }, null)).toBe(
      true,
    );
  });

  it('turns multiline pasted content into one plain-text line', () => {
    expect(normalizeContentAttachmentPaste('First\r\nSecond\nThird')).toBe(
      'First Second Third',
    );
  });
});
