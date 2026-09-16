import { describe, expect, it } from 'vitest';
import {
  contentAssetSelectionChanged,
  contentAttachmentAssetChanged,
  normalizeContentAttachmentPaste,
} from '../../../app/components/content/content-attachment';

describe('content attachment state', () => {
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
