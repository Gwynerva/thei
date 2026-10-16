<script lang="ts" setup>
import AssetModal from '#layers/thei/app/modals/asset-modal/AssetModal.vue';
import AssetModalButton from '#layers/thei/app/modals/asset-modal/AssetModalButton.vue';
import AssetModalFileInfo from '#layers/thei/app/modals/asset-modal/AssetModalFileInfo.vue';
import AssetModalPager from '#layers/thei/app/modals/asset-modal/AssetModalPager.vue';
import AssetModalPreviewMedia from '#layers/thei/app/modals/asset-modal/AssetModalPreviewMedia.vue';
import FilePreviewContent from '#layers/thei/app/components/file-preview/FilePreviewContent.vue';
import { isAssetExtensionSafeInline } from '#layers/thei/shared/assets/formats';
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
/** A browser opens the file in a tab of its own; any other is downloaded. */
const opensInTab = computed(
  () =>
    !!current.value.media ||
    isAssetExtensionSafeInline(current.value.extension),
);
</script>

<template>
  <AssetModal :aside-title="publicText(current.title)">
    <template #preview>
      <AssetModalPreviewMedia
        v-if="current.media"
        ref="mediaPreview"
        :key="current.key"
        :extension="current.extension"
        :src="current.media.src"
        :poster="videoPosterOf(current.media)"
        :has-audio="current.media.hasAudio"
        :display-dimensions="dimensions"
      />
      <FilePreviewContent
        v-else
        :key="current.key"
        :src="current.href"
        :extension="current.extension"
        :size="current.size"
        :archived-original="current.archivedOriginal"
        :title="publicText(current.title)"
        :paged="count > 1"
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
        v-if="opensInTab"
        icon="arrow-outward"
        target="_blank"
        :href="sitePath(current.href)"
        :data-title-popup="phrase.direct_link_to_asset"
        :aria-label="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="!current.media"
        icon="download"
        download
        :href="sitePath(current.href)"
        :data-title-popup="phrase.download_asset"
        :aria-label="phrase.download_asset"
        data-asset-download
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
          {{ publicText(current.description) }}
        </p>
        <!-- The file's own description: what it shows, said for whoever
             cannot see it. -->
        <section
          v-if="current.alt"
          :key="`alt:${current.key}`"
          class="flex flex-col gap-1 text-sm"
          data-public-asset-description
        >
          <h3 class="text-xs font-semibold text-text-3">
            {{ phrase.asset_description }}
          </h3>
          <p class="leading-relaxed wrap-anywhere whitespace-pre-line">
            {{ publicText(current.alt) }}
          </p>
        </section>
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
