<script lang="ts" setup>
import type {
  AssetReplaceResult,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import {
  launchAssetWizard,
  mapAssetVariantToReplaceResult,
} from '#layers/thei/app/composables/asset-wizard';
import { AssetType, type AssetMeta } from '#layers/thei/shared/asset';
import {
  anyFileExtensionProfile,
  imageExtensionProfile,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import AssetAddEdit from '#layers/thei/app/components/AssetAddEdit.vue';
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
import ShowcaseConfigPane from './ShowcaseConfigPane.vue';
import OtherConfigPane from './OtherConfigPane.vue';
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
const PROJECT_ASSET_MAX_SIZE = 100 * 1024 * 1024;

type PickedAsset = {
  asset: AssetVariantInfo;
  result: AssetReplaceResult;
};

function archivedOriginalFromMeta(meta: AssetMeta | null | undefined) {
  return meta && 'archivedOriginal' in meta ? meta.archivedOriginal : undefined;
}

async function pickProjectMediaAsset(
  uploadProfile?: AssetUploadProfile,
): Promise<PickedAsset | undefined> {
  const asset = await launchProjectAssetWizard({
    accept: [imageExtensionProfile, videoExtensionProfile],
    maxSize: PROJECT_ASSET_MAX_SIZE,
    uploadProfile,
  });
  if (
    !asset ||
    (asset.type !== AssetType.Image && asset.type !== AssetType.Video)
  ) {
    return undefined;
  }

  const result = mapAssetVariantToReplaceResult(asset);
  return result.previewUrl ? { asset, result } : undefined;
}

async function pickAnyProjectAsset(): Promise<PickedAsset | undefined> {
  const asset = await launchProjectAssetWizard({
    accept: anyFileExtensionProfile,
    maxSize: PROJECT_ASSET_MAX_SIZE,
  });
  return asset
    ? { asset, result: mapAssetVariantToReplaceResult(asset) }
    : undefined;
}

async function launchProjectAssetWizard(
  options: Parameters<typeof launchAssetWizard>[0],
) {
  try {
    return await launchAssetWizard(options);
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

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

// Showcase asset list

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

// Icon handlers

async function openIconUpload() {
  const picked = await pickProjectMediaAsset('project-icon');
  if (!picked) return;
  applyIconAsset(picked.result);
  openIconModal();
}

function openIconModal() {
  modal.open({
    title: phrase.value.project_icon,
    component: AssetEditPane,
    props: {
      previewUrl: iconPreviewUrl.value!,
      videoUrl: iconVideoUrl.value,
      size: iconSize.value,
      primaryLabel: phrase.value.save,
      async onReplaceClick(
        updatePreview: (result: AssetReplaceResult) => void,
      ) {
        const picked = await pickProjectMediaAsset('project-icon');
        if (!picked) return;
        updatePreview(picked.result);
      },
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

// Banner handlers

async function openBannerUpload() {
  const picked = await pickProjectMediaAsset('project-banner');
  if (!picked) return;
  applyBannerAsset(picked.result);
  openBannerModal();
}

function openBannerModal() {
  modal.open({
    title: phrase.value.project_banner,
    component: AssetEditPane,
    props: {
      previewUrl: bannerPreviewUrl.value!,
      videoUrl: bannerVideoUrl.value,
      size: bannerSize.value,
      primaryLabel: phrase.value.save,
      async onReplaceClick(
        updatePreview: (result: AssetReplaceResult) => void,
      ) {
        const picked = await pickProjectMediaAsset('project-banner');
        if (!picked) return;
        updatePreview(picked.result);
      },
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

// Showcase handlers

async function openShowcaseAdd() {
  const picked = await pickProjectMediaAsset();
  if (!picked || !picked.result.previewUrl) return;

  modal.open({
    title: phrase.value.showcase_details,
    component: ShowcaseConfigPane,
    props: {
      assetUuid: picked.result.assetUuid,
      assetType: picked.asset.type,
      previewUrl: picked.result.previewUrl,
      videoUrl: picked.result.videoUrl,
      assetUrl: picked.result.assetUrl,
      size: picked.result.size,
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
  let currentAssetUuid = snapshot.assetUuid;
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
        void (async () => {
          const picked = await pickProjectMediaAsset();
          if (!picked || !picked.result.previewUrl) return;
          updatePreview(picked.result);
        })();
      },
      onSave(patch: { caption?: string; access?: 'project' | 'private' }) {
        updateItem(currentAssetUuid, patch as Partial<ShowcaseAssetGetItem>);
      },
      onReplaced(result: AssetReplaceResult) {
        if (!result.previewUrl) return;
        updateItem(currentAssetUuid, {
          assetUuid: result.assetUuid,
          previewUrl: result.previewUrl,
          videoUrl: result.videoUrl,
          size: result.size,
        } as Partial<ShowcaseAssetGetItem>);
        currentAssetUuid = result.assetUuid;
      },
      onDeleted() {
        removeItem(currentAssetUuid);
      },
    },
  });
}

// Other-files handlers

async function openOtherAdd() {
  const picked = await pickAnyProjectAsset();
  if (!picked) return;

  modal.open({
    title: phrase.value.other_details,
    component: OtherConfigPane,
    props: {
      assetUuid: picked.result.assetUuid,
      extension: picked.result.extension,
      previewUrl: picked.result.previewUrl,
      videoUrl: picked.result.videoUrl,
      assetUrl: picked.result.assetUrl,
      size: picked.result.size,
      archivedOriginal: archivedOriginalFromMeta(picked.result.meta),
      onAdded(result: OtherAssetAddedResult) {
        addOtherItem({
          assetUuid: result.assetUuid,
          previewUrl: result.previewUrl,
          videoUrl: result.videoUrl,
          assetUrl: result.assetUrl,
          extension: result.extension,
          archivedOriginal: result.archivedOriginal,
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
  let currentAssetUuid = snapshot.assetUuid;
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
      archivedOriginal: snapshot.archivedOriginal,
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
        void (async () => {
          const picked = await pickAnyProjectAsset();
          if (!picked) return;
          updatePreview(picked.result);
        })();
      },
      onSave(patch: {
        title?: string;
        caption?: string;
        access?: 'project' | 'private';
      }) {
        updateOtherItem(currentAssetUuid, patch as Partial<OtherAssetGetItem>);
      },
      onReplaced(result: AssetReplaceResult) {
        updateOtherItem(currentAssetUuid, {
          assetUuid: result.assetUuid,
          previewUrl: result.previewUrl,
          videoUrl: result.videoUrl,
          assetUrl: result.assetUrl,
          extension: result.extension,
          archivedOriginal: archivedOriginalFromMeta(result.meta),
          size: result.size,
        } as Partial<OtherAssetGetItem>);
        currentAssetUuid = result.assetUuid;
      },
      onDeleted() {
        removeOtherItem(currentAssetUuid);
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
