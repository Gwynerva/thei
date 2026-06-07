<script lang="ts" setup>
import AssetEditPane from '#layers/thei/app/components/AssetEditPane.vue';
import type { ArchivedOriginalFileMeta } from '#layers/thei/shared/asset';
import type { OtherAssetAddedResult } from '../composables';

const props = defineProps<{
  assetUuid: string;
  extension: string;
  previewUrl?: string;
  videoUrl?: string;
  assetUrl: string;
  size?: number;
  archivedOriginal?: ArchivedOriginalFileMeta;
  onAdded?: (result: OtherAssetAddedResult) => void;
}>();

const modal = useModal();
</script>

<template>
  <AssetEditPane
    :preview-url="previewUrl"
    :video-url="videoUrl"
    :size="size"
    :asset-uuid="assetUuid"
    :extension="extension"
    :asset-url="assetUrl"
    :archived-original="archivedOriginal"
    :primary-label="phrase.other_add"
    :show-title="true"
    :require-title="true"
    :show-caption="true"
    :caption-as-textarea="true"
    :caption-label="phrase.other_description"
    :show-access="true"
    :show-delete="false"
    :on-save="
      (patch) => {
        props.onAdded?.({
          assetUuid,
          extension,
          archivedOriginal,
          previewUrl,
          videoUrl,
          assetUrl,
          title: patch.title!,
          caption: patch.caption,
          access: patch.access ?? 'project',
          size: size ?? 0,
        });
        modal.close();
      }
    "
  />
</template>
