<script lang="ts" setup>
import AssetModal from '#layers/thei/app/modals/asset-modal/AssetModal.vue';
import AssetModalButton from '#layers/thei/app/modals/asset-modal/AssetModalButton.vue';
import AssetModalFileInfo from '#layers/thei/app/modals/asset-modal/AssetModalFileInfo.vue';
import AssetModalPager from '#layers/thei/app/modals/asset-modal/AssetModalPager.vue';
import AssetModalPreviewMedia from '#layers/thei/app/modals/asset-modal/AssetModalPreviewMedia.vue';
import type { PublicAssetModalData } from './modal';

const props = defineProps<{ modalData: PublicAssetModalData }>();

/**
 * Which of the files is shown. Kept here rather than reopening the viewer for
 * each step: every open modal holds an entry in the browser history, and a
 * gallery walked through file by file would fill the Back button with it.
 */
const index = ref(
  Math.max(
    0,
    props.modalData.items.findIndex(
      (item) => item.key === props.modalData.startKey,
    ),
  ),
);
const count = computed(() => props.modalData.items.length);
const current = computed(() => props.modalData.items[index.value]!);

function step(delta: number) {
  if (count.value < 2) return;
  index.value = (index.value + delta + count.value) % count.value;
}
useArrowKeys({ previous: () => step(-1), next: () => step(1) });

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');
const dimensions = computed(() => {
  const { width, height } = current.value.media ?? {};
  return width && height ? { width, height } : undefined;
});
</script>

<template>
  <AssetModal :aside-title="current.title">
    <template #preview>
      <AssetModalPreviewMedia
        v-if="current.media"
        ref="mediaPreview"
        :key="current.key"
        :extension="current.extension"
        :src="current.media.src"
        :has-audio="current.media.hasAudio"
        :display-dimensions="dimensions"
      />
      <FilePreview
        v-else
        :key="current.key"
        :extension="current.extension"
        class="w-1/2 max-w-132 text-text-2"
      />
    </template>
    <template v-if="count > 1" #nav>
      <AssetModalPager
        :index="index"
        :count="count"
        @previous="step(-1)"
        @next="step(1)"
      />
    </template>
    <template #buttons>
      <AssetModalButton
        icon="arrow-outward"
        target="_blank"
        :href="current.href"
        :data-title-popup="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="current.media"
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
          v-if="current.description"
          class="text-sm leading-relaxed text-text-2"
        >
          {{ current.description }}
        </p>
        <AssetModalFileInfo
          :key="current.key"
          :extension="current.extension"
          :size="current.size"
          :dimensions="dimensions"
          :archived-original="current.archivedOriginal"
        />
      </div>
    </template>
  </AssetModal>
</template>
