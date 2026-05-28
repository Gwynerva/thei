<script lang="ts" setup>
import type {
  AssetPickResult,
  AssetReplaceResult,
} from '#layers/thei/shared/api/asset';
import AssetAddEdit from '#layers/thei/app/components/AssetAddEdit.vue';
import AssetPickPane from '#layers/thei/app/components/AssetPickPane.vue';
import AssetEditPane from '#layers/thei/app/components/AssetEditPane.vue';
import type {
  OtherAssetGetItem,
  ShowcaseAssetGetItem,
} from '#layers/thei/shared/api/project';
import {
  projectDataInjectionKey,
  iconPreviewUrlKey,
  bannerPreviewUrlKey,
  iconVideoUrlKey,
  bannerVideoUrlKey,
  iconSizeKey,
  bannerSizeKey,
  otherItemsKey,
  showcaseItemsKey,
} from '../composables';
import ShowcaseAddPane from './ShowcaseAddPane.vue';
import OtherAddPane from './OtherAddPane.vue';
import type {
  OtherAssetAddedResult,
  ShowcaseAssetAddedResult,
} from '../composables';
import { useProjectAssetList } from '../composables/use-project-asset-list';

const projectData = inject(projectDataInjectionKey)!;
const iconPreviewUrl = inject(iconPreviewUrlKey)!;
const bannerPreviewUrl = inject(bannerPreviewUrlKey)!;
const iconVideoUrl = inject(iconVideoUrlKey)!;
const bannerVideoUrl = inject(bannerVideoUrlKey)!;
const iconSize = inject(iconSizeKey)!;
const bannerSize = inject(bannerSizeKey)!;
const showcaseItems = inject(showcaseItemsKey)!;
const otherItems = inject(otherItemsKey)!;

const modal = useModal();

function applyIconAsset(result: AssetReplaceResult) {
  if (!result.previewUrl) return;
  projectData.value.iconAssetUuid = result.assetUuid;
  iconPreviewUrl.value = result.previewUrl;
  iconVideoUrl.value = result.videoUrl;
  iconSize.value = result.size;
}

function applyBannerAsset(result: AssetReplaceResult) {
  if (!result.previewUrl) return;
  projectData.value.bannerAssetUuid = result.assetUuid;
  bannerPreviewUrl.value = result.previewUrl;
  bannerVideoUrl.value = result.videoUrl;
  bannerSize.value = result.size;
}

// ── Showcase asset list ───────────────────────────────────────────────────────

const { addItem, updateItem, removeItem, dragSort } = useProjectAssetList(
  showcaseItems,
  (items) => {
    projectData.value.showcaseAssets = items.map((item) => ({
      assetUuid: item.assetUuid,
      caption: item.caption,
      access: item.access,
    }));
  },
);

const {
  addItem: addOtherItem,
  updateItem: updateOtherItem,
  removeItem: removeOtherItem,
  dragSort: otherDragSort,
} = useProjectAssetList(otherItems, (items) => {
  projectData.value.otherAssets = items.map((item) => ({
    assetUuid: item.assetUuid,
    title: item.title,
    caption: item.caption,
    access: item.access,
  }));
});

// ── Icon handlers ─────────────────────────────────────────────────────────────

function openIconUpload() {
  modal.open({
    title: phrase.value.project_icon,
    component: AssetPickPane,
    props: {
      imageProfileId: 'icon',
      imageOriginalProfileId: 'icon-original',
      videoProfileId: 'icon-video',
      videoOriginalProfileId: 'icon-video-original',
    },
    onBack(result: unknown) {
      if (!result) return;
      applyIconAsset(result as AssetPickResult);
      // Immediately open the edit pane after upload
      openIconModal();
    },
  });
}

function openIconModal() {
  modal.open({
    title: phrase.value.project_icon,
    component: AssetEditPane,
    props: {
      previewUrl: iconPreviewUrl.value!,
      videoUrl: iconVideoUrl.value,
      size: iconSize.value,
      imageProfileId: 'icon',
      imageOriginalProfileId: 'icon-original',
      videoProfileId: 'icon-video',
      videoOriginalProfileId: 'icon-video-original',
      primaryLabel: phrase.value.save,
      onReplaced(result: AssetReplaceResult) {
        applyIconAsset(result);
      },
      onDeleted() {
        projectData.value.iconAssetUuid = undefined;
        iconPreviewUrl.value = undefined;
        iconVideoUrl.value = undefined;
        iconSize.value = undefined;
      },
    },
  });
}

// ── Banner handlers ───────────────────────────────────────────────────────────

function openBannerUpload() {
  modal.open({
    title: phrase.value.project_banner,
    component: AssetPickPane,
    props: {
      imageProfileId: 'banner',
      imageOriginalProfileId: 'banner-original',
      videoProfileId: 'banner-video',
      videoOriginalProfileId: 'banner-video-original',
    },
    onBack(result: unknown) {
      if (!result) return;
      applyBannerAsset(result as AssetPickResult);
      openBannerModal();
    },
  });
}

function openBannerModal() {
  modal.open({
    title: phrase.value.project_banner,
    component: AssetEditPane,
    props: {
      previewUrl: bannerPreviewUrl.value!,
      videoUrl: bannerVideoUrl.value,
      size: bannerSize.value,
      imageProfileId: 'banner',
      imageOriginalProfileId: 'banner-original',
      videoProfileId: 'banner-video',
      videoOriginalProfileId: 'banner-video-original',
      primaryLabel: phrase.value.save,
      onReplaced(result: AssetReplaceResult) {
        applyBannerAsset(result);
      },
      onDeleted() {
        projectData.value.bannerAssetUuid = undefined;
        bannerPreviewUrl.value = undefined;
        bannerVideoUrl.value = undefined;
        bannerSize.value = undefined;
      },
    },
  });
}

// ── Showcase handlers ─────────────────────────────────────────────────────────

function openShowcaseAdd() {
  modal.open({
    title: phrase.value.showcase_add,
    component: ShowcaseAddPane,
    props: {
      onAdded(result: ShowcaseAssetAddedResult) {
        addItem({
          assetUuid: result.assetUuid,
          type: result.assetType,
          previewUrl: result.previewUrl,
          videoUrl: result.videoUrl,
          caption: result.caption,
          access: result.access,
          size: result.size,
        });
      },
    },
  });
}

function openShowcaseAsset(index: number) {
  const snapshot = showcaseItems.value[index];
  if (!snapshot) return;
  modal.open({
    title: phrase.value.showcase,
    component: AssetEditPane,
    props: {
      previewUrl: snapshot.previewUrl,
      videoUrl: snapshot.videoUrl,
      size: snapshot.size,
      assetUuid: snapshot.assetUuid,
      showCaption: true,
      showAccess: true,
      initialCaption: snapshot.caption,
      initialAccess: snapshot.access,
      primaryLabel: phrase.value.save,
      onReplaceClick(updatePreview: (result: AssetReplaceResult) => void) {
        modal.push({
          title: phrase.value.showcase_add,
          component: ShowcaseAddPane,
          props: {
            onReplaced(result: AssetReplaceResult) {
              if (!result.previewUrl) return;
              updateItem(snapshot.assetUuid, {
                assetUuid: result.assetUuid,
                previewUrl: result.previewUrl,
                videoUrl: result.videoUrl,
                size: result.size,
              } as Partial<ShowcaseAssetGetItem>);
              updatePreview(result);
            },
          },
        });
      },
      onSave(patch: { caption?: string; access?: 'project' | 'private' }) {
        updateItem(snapshot.assetUuid, patch as Partial<ShowcaseAssetGetItem>);
      },
      onReplaced(result: AssetReplaceResult) {
        if (!result.previewUrl) return;
        updateItem(snapshot.assetUuid, {
          assetUuid: result.assetUuid,
          previewUrl: result.previewUrl,
          videoUrl: result.videoUrl,
          size: result.size,
        } as Partial<ShowcaseAssetGetItem>);
      },
      onDeleted() {
        removeItem(snapshot.assetUuid);
      },
    },
  });
}

// ── Other-files handlers ─────────────────────────────────────────────────────

function openOtherAdd() {
  modal.open({
    title: phrase.value.other_add,
    component: OtherAddPane,
    props: {
      onAdded(result: OtherAssetAddedResult) {
        addOtherItem({
          assetUuid: result.assetUuid,
          previewUrl: result.previewUrl,
          videoUrl: result.videoUrl,
          assetUrl: result.assetUrl,
          extension: result.extension,
          size: result.size,
          title: result.title,
          caption: result.caption,
          access: result.access,
        });
      },
    },
  });
}

function openOtherAsset(index: number) {
  const snapshot = otherItems.value[index];
  if (!snapshot) return;
  modal.open({
    title: phrase.value.other_files,
    component: AssetEditPane,
    props: {
      previewUrl: snapshot.previewUrl,
      videoUrl: snapshot.videoUrl,
      size: snapshot.size,
      assetUuid: snapshot.assetUuid,
      extension: snapshot.extension,
      assetUrl: snapshot.assetUrl,
      showTitle: true,
      requireTitle: true,
      showCaption: true,
      captionAsTextarea: true,
      captionLabel: phrase.value.other_description,
      showAccess: true,
      initialTitle: snapshot.title,
      initialCaption: snapshot.caption,
      initialAccess: snapshot.access,
      primaryLabel: phrase.value.save,
      onReplaceClick(updatePreview: (result: AssetReplaceResult) => void) {
        modal.push({
          title: phrase.value.other_add,
          component: OtherAddPane,
          props: {
            onReplaced(result: AssetReplaceResult) {
              updateOtherItem(snapshot.assetUuid, {
                assetUuid: result.assetUuid,
                previewUrl: result.previewUrl,
                videoUrl: result.videoUrl,
                assetUrl: result.assetUrl,
                extension: result.extension,
                size: result.size,
              } as Partial<OtherAssetGetItem>);
              updatePreview(result);
            },
          },
        });
      },
      onSave(patch: {
        title?: string;
        caption?: string;
        access?: 'project' | 'private';
      }) {
        updateOtherItem(
          snapshot.assetUuid,
          patch as Partial<OtherAssetGetItem>,
        );
      },
      onReplaced(result: AssetReplaceResult) {
        updateOtherItem(snapshot.assetUuid, {
          assetUuid: result.assetUuid,
          previewUrl: result.previewUrl,
          videoUrl: result.videoUrl,
          assetUrl: result.assetUrl,
          extension: result.extension,
          size: result.size,
        } as Partial<OtherAssetGetItem>);
      },
      onDeleted() {
        removeOtherItem(snapshot.assetUuid);
      },
    },
  });
}
</script>

<template>
  <div>
    <SectionHeader
      icon="files"
      :title="phrase.project_files"
      :description="phrase.project_files_description"
      class="mb-md"
    />
    <Box class="flex flex-col">
      <div class="flex flex-wrap gap-md p-sm sm:p-md">
        <!-- Project Icon -->
        <div class="flex flex-1 items-center gap-sm">
          <AssetAddEdit
            :preview-url="iconPreviewUrl"
            :video-url="iconVideoUrl"
            :size="iconSize"
            class="size-18 cursor-pointer"
            @click="iconPreviewUrl ? openIconModal() : openIconUpload()"
          />
          <div class="tracking-tight">
            <div class="font-semibold">{{ phrase.project_icon }}</div>
            <p class="text-sm text-text-2">{{ phrase.project_icon_hint }}</p>
          </div>
        </div>

        <!-- Project Banner -->
        <div class="flex flex-1 items-center gap-sm">
          <AssetAddEdit
            :preview-url="bannerPreviewUrl"
            :video-url="bannerVideoUrl"
            :size="bannerSize"
            class="aspect-video h-18 cursor-pointer"
            @click="bannerPreviewUrl ? openBannerModal() : openBannerUpload()"
          />
          <div class="tracking-tight">
            <div class="font-semibold">{{ phrase.project_banner }}</div>
            <p class="text-sm text-text-2">{{ phrase.project_banner_hint }}</p>
          </div>
        </div>
      </div>

      <!-- Showcase header -->
      <div
        class="border-y border-border-1 bg-bg-3 px-md py-xs text-sm
          tracking-tight"
      >
        <div class="font-semibold text-text-2">{{ phrase.showcase }}</div>
        <div class="text-text-3">{{ phrase.showcase_description }}</div>
      </div>

      <!-- Showcase grid -->
      <div class="flex flex-wrap gap-sm p-sm sm:p-md">
        <!-- Existing showcase items -->
        <AssetAddEdit
          v-for="(item, index) in showcaseItems"
          :key="item.assetUuid"
          :data-drag-index="index"
          :preview-url="item.previewUrl"
          :video-url="item.videoUrl"
          :size="item.size"
          :is-private="item.access === 'private'"
          class="size-18 cursor-pointer touch-none"
          :class="{
            'opacity-50': dragSort.draggingIndex.value === index,
            'ring-2 ring-accent ring-offset-2 ring-offset-bg-1':
              dragSort.dragOverIndex.value === index &&
              dragSort.draggingIndex.value !== index,
          }"
          @click="dragSort.guardClick(() => openShowcaseAsset(index))"
          @pointerdown="dragSort.onPointerDown(index, $event)"
        />

        <!-- Add button (always last) -->
        <AssetAddEdit class="size-18 cursor-pointer" @click="openShowcaseAdd" />
      </div>

      <!-- Other-files header -->
      <div
        class="border-y border-border-1 bg-bg-3 px-md py-xs text-sm
          tracking-tight"
      >
        <div class="font-semibold text-text-2">{{ phrase.other_files }}</div>
        <div class="text-text-3">{{ phrase.other_files_description }}</div>
      </div>

      <!-- Other-files grid -->
      <div class="flex flex-wrap gap-sm p-sm sm:p-md">
        <div
          v-for="(item, index) in otherItems"
          class="flex flex-col items-center gap-xs"
        >
          <AssetAddEdit
            :key="item.assetUuid"
            :data-drag-index="index"
            :preview-url="item.previewUrl"
            :video-url="item.videoUrl"
            :extension="item.extension"
            :size="item.size"
            :is-private="item.access === 'private'"
            class="size-18 cursor-pointer touch-none"
            :class="{
              'opacity-50': otherDragSort.draggingIndex.value === index,
              'ring-2 ring-accent ring-offset-2 ring-offset-bg-1':
                otherDragSort.dragOverIndex.value === index &&
                otherDragSort.draggingIndex.value !== index,
            }"
            @click="otherDragSort.guardClick(() => openOtherAsset(index))"
            @pointerdown="otherDragSort.onPointerDown(index, $event)"
          />
          <div
            class="line-clamp-2 max-w-24 cursor-help text-center text-xs
              wrap-break-word text-text-2"
            :data-title-popup="item.title"
          >
            {{ item.title }}
          </div>
        </div>

        <AssetAddEdit class="size-18 cursor-pointer" @click="openOtherAdd" />
      </div>
    </Box>
  </div>
</template>
