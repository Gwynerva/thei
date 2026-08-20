import { describe, expect, it } from 'vitest';
import {
  gallerySelectedId,
  gallerySelectedIdAfterRemoval,
} from '../../../app/components/content/gallery-state';
import type { ContentGalleryItem } from '../../../shared/content';

const item = (id: string): ContentGalleryItem => ({
  id,
  asset: { assetUuid: `asset-${id}` },
});

describe('gallery selection state', () => {
  it('selects the first item by default and keeps selection after reorder', () => {
    const items = [item('one'), item('two'), item('three')];
    expect(gallerySelectedId(items)).toBe('one');
    expect(gallerySelectedId([items[2]!, items[0]!, items[1]!], 'two')).toBe(
      'two',
    );
  });

  it('selects the next item and then the previous one after removal', () => {
    const items = [item('one'), item('two'), item('three')];
    expect(gallerySelectedIdAfterRemoval(items, 'two', 'two')).toBe('three');
    expect(gallerySelectedIdAfterRemoval(items, 'three', 'three')).toBe('two');
    expect(gallerySelectedIdAfterRemoval([item('one')], 'one', 'one')).toBe(
      undefined,
    );
  });

  it('activates the first batch item only for an empty gallery', () => {
    const batch = [item('new-one'), item('new-two')];
    expect(gallerySelectedId(batch)).toBe('new-one');
    expect(gallerySelectedId([item('old'), ...batch], 'old')).toBe('old');
  });

  it('does not mutate items while changing the interface selection', () => {
    const items = [item('one'), item('two')];
    const before = structuredClone(items);
    expect(gallerySelectedId(items, 'two')).toBe('two');
    expect(items).toEqual(before);
  });
});
