import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import type { MediaDescriptor } from '#layers/thei/shared/media';

export interface SingleMediaAssetState {
  setAssetUuid: (assetUuid: string | undefined) => void;
  media: Ref<MediaDescriptor | undefined>;
  size?: Ref<number | undefined>;
  afterDetach?: () => void | Promise<void>;
}

export function singleAssetUsageDelta(
  currentAssetUuid: string | undefined,
  savedAssetUuid: string | undefined,
): Record<string, number> {
  if (currentAssetUuid === savedAssetUuid) return {};

  const delta: Record<string, number> = {};
  if (savedAssetUuid) delta[savedAssetUuid] = -1;
  if (currentAssetUuid) {
    delta[currentAssetUuid] = (delta[currentAssetUuid] ?? 0) + 1;
  }
  return delta;
}

export function applySingleMediaAsset(
  state: SingleMediaAssetState,
  asset: AssetVariantInfo,
) {
  if (
    (asset.type !== AssetType.Image && asset.type !== AssetType.Video) ||
    !asset.media
  ) {
    return false;
  }

  state.setAssetUuid(asset.assetUuid);
  state.media.value = asset.media;
  if (state.size) state.size.value = asset.size;
  return true;
}

export async function detachSingleMediaAsset(state: SingleMediaAssetState) {
  state.setAssetUuid(undefined);
  state.media.value = undefined;
  if (state.size) state.size.value = undefined;
  await state.afterDetach?.();
}
