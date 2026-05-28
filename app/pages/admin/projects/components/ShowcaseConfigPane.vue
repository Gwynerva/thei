<script lang="ts" setup>
import { AssetType } from '#layers/thei/shared/asset';
import AssetEditPane from '#layers/thei/app/components/AssetEditPane.vue';
import type { ShowcaseAssetAddedResult } from '../composables';

const props = defineProps<{
  assetUuid: string;
  assetType: AssetType;
  previewUrl: string;
  videoUrl?: string;
  assetUrl: string;
  size?: number;
  onAdded?: (result: ShowcaseAssetAddedResult) => void;
}>();

const modal = useModal();
</script>

<template>
  <AssetEditPane
    :preview-url="previewUrl"
    :video-url="videoUrl"
    :size="size"
    :asset-uuid="assetUuid"
    :primary-label="phrase.showcase_confirm_add"
    :show-caption="true"
    :show-access="true"
    :show-delete="false"
    :on-save="
      (patch) => {
        props.onAdded?.({
          assetUuid,
          assetType,
          previewUrl,
          videoUrl,
          assetUrl,
          caption: patch.caption,
          access: patch.access ?? 'project',
          size: size ?? 0,
        });
        modal.close();
      }
    "
  />
</template>
