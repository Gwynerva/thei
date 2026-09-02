<script lang="ts" setup>
import type { PublicAssetDescriptor } from '#layers/thei/shared/api/public';
import AssetModal from '#layers/thei/app/modals/asset-modal/AssetModal.vue';
import AssetModalButton from '#layers/thei/app/modals/asset-modal/AssetModalButton.vue';
import AssetModalFileInfo from '#layers/thei/app/modals/asset-modal/AssetModalFileInfo.vue';
import AssetModalPreviewMedia from '#layers/thei/app/modals/asset-modal/AssetModalPreviewMedia.vue';

const props = defineProps<{ modalData: PublicAssetDescriptor }>();
const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');
const dimensions = computed(() => {
  const { width, height } = props.modalData.media ?? {};
  return width && height ? { width, height } : undefined;
});
</script>

<template>
  <AssetModal :aside-title="modalData.title">
    <template #preview>
      <AssetModalPreviewMedia
        v-if="modalData.media"
        ref="mediaPreview"
        :extension="modalData.extension"
        :src="modalData.media.src"
        :display-dimensions="dimensions"
      />
      <FilePreview
        v-else
        :extension="modalData.extension"
        class="w-1/2 max-w-132 text-text-2"
      />
    </template>
    <template #buttons>
      <AssetModalButton
        icon="arrow-outward"
        target="_blank"
        :href="modalData.href"
        :data-title-popup="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="modalData.media"
        @click="mediaPreview?.handleZoomButtonClick()"
      >
        <span class="text-xs font-bold"
          >{{ mediaPreview?.zoomPercent ?? 100 }}%</span
        >
      </AssetModalButton>
    </template>
    <template #aside>
      <div class="flex flex-col gap-sm p-sm">
        <p
          v-if="modalData.description"
          class="text-sm leading-relaxed text-text-2"
        >
          {{ modalData.description }}
        </p>
        <AssetModalFileInfo
          :name="modalData.title"
          :extension="modalData.extension"
          :size="modalData.size"
          :dimensions="dimensions"
          :archived-original="modalData.archivedOriginal"
        />
      </div>
    </template>
  </AssetModal>
</template>
