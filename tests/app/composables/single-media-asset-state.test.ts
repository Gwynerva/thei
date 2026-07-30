import { describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';
import type { AssetVariantInfo } from '../../../shared/api/asset';
import { AssetType } from '../../../shared/asset';
import {
  applySingleMediaAsset,
  detachSingleMediaAsset,
  singleAssetUsageDelta,
} from '../../../app/composables/single-media-asset-state';

function imageAsset(assetUuid: string): AssetVariantInfo {
  return {
    assetUuid,
    familyUuid: 'af-family',
    slug: assetUuid,
    type: AssetType.Image,
    extension: 'webp',
    size: 42,
    assetUrl: `/assets/${assetUuid}.webp`,
    media: {
      src: `/assets/${assetUuid}.webp`,
      kind: 'image',
      width: 128,
      height: 128,
    },
  };
}

describe('single media asset state', () => {
  test('calculates usage changes for replacement and detach', () => {
    expect(singleAssetUsageDelta('new', 'old')).toEqual({
      old: -1,
      new: 1,
    });
    expect(singleAssetUsageDelta(undefined, 'old')).toEqual({ old: -1 });
    expect(singleAssetUsageDelta('new', undefined)).toEqual({ new: 1 });
    expect(singleAssetUsageDelta('same', 'same')).toEqual({});
  });

  test('applies a media asset to every bound field', () => {
    const assetUuid = ref<string>();
    const media = ref();
    const size = ref<number>();
    const asset = imageAsset('asset-new');

    expect(
      applySingleMediaAsset(
        {
          setAssetUuid: (value) => {
            assetUuid.value = value;
          },
          media,
          size,
        },
        asset,
      ),
    ).toBe(true);
    expect(assetUuid.value).toBe('asset-new');
    expect(media.value).toEqual(asset.media);
    expect(size.value).toBe(42);
  });

  test('detaches before running fallback restoration', async () => {
    const assetUuid = ref<string | undefined>('asset-old');
    const media = ref(imageAsset('asset-old').media);
    const size = ref<number | undefined>(42);
    const afterDetach = vi.fn(() => {
      expect(assetUuid.value).toBeUndefined();
      expect(media.value).toBeUndefined();
      expect(size.value).toBeUndefined();
    });

    await detachSingleMediaAsset({
      setAssetUuid: (value) => {
        assetUuid.value = value;
      },
      media,
      size,
      afterDetach,
    });

    expect(afterDetach).toHaveBeenCalledOnce();
  });
});
