<script lang="ts" setup>
import {
  imageExtensionProfile,
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions.js';
import AssetModal from '../asset-modal/AssetModal.vue';
import AssetModalButton from '../asset-modal/AssetModalButton.vue';
import AssetModalPreviewFile from '../asset-modal/AssetModalPreviewFile.vue';
import AssetModalPreviewMedia from '../asset-modal/AssetModalPreviewMedia.vue';

const props = defineProps<{
  modalData: {
    file: {
      name: string;
      extension: string;
      objectUrl: string;
      size: number;
    };
  };
}>();

const isMedia = computed(() => {
  const isImage = isExtensionAllowed(
    props.modalData.file.extension,
    imageExtensionProfile,
  );
  const isVideo = isExtensionAllowed(
    props.modalData.file.extension,
    videoExtensionProfile,
  );
  return isImage || isVideo;
});

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');
</script>

<template>
  <AssetModal>
    <template #preview>
      <AssetModalPreviewMedia
        v-if="isMedia"
        ref="mediaPreview"
        :extension="modalData.file.extension"
        :src="modalData.file.objectUrl"
      />
      <AssetModalPreviewFile v-else :extension="modalData.file.extension" />
    </template>
    <template #buttons>
      <AssetModalButton
        icon="arrow-outward"
        target="_blank"
        :to="modalData.file.objectUrl"
        :external="true"
        :data-title-popup="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="isMedia"
        @click="mediaPreview?.handleZoomButtonClick()"
      >
        <span class="text-xs font-bold tracking-tight transition">
          {{ mediaPreview?.zoomPercent ?? 100 }}%
        </span>
      </AssetModalButton>
    </template>
    <template #aside>
      <div class="h-[1000px]">Formalism</div>
    </template>
  </AssetModal>
</template>
