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
import { useProjectAssetList } from '../composables/use-project-asset-list';
import { projectAssetDetailsModal } from './project-asset-details-modal';

const projectData = inject(projectDataInjectionKey)!;
const iconPreviewUrl = inject(iconPreviewUrlKey)!;
const bannerPreviewUrl = inject(bannerPreviewUrlKey)!;
const iconVideoUrl = inject(iconVideoUrlKey)!;
const bannerVideoUrl = inject(bannerVideoUrlKey)!;
const iconSize = inject(iconSizeKey)!;
const bannerSize = inject(bannerSizeKey)!;
const showcaseItems = inject(showcaseItemsKey)!;
const otherItems = inject(otherItemsKey)!;

const PROJECT_ASSET_MAX_SIZE = 100 * 1024 * 1024;

type PickedAsset = {
  asset: AssetVariantInfo;
  result: AssetReplaceResult;
};

type AccessLevel = 'project' | 'private';

function archivedOriginalFromMeta(meta: AssetMeta | null | undefined) {
  return meta && 'archivedOriginal' in meta ? meta.archivedOriginal : undefined;
}

function extensionFromUrl(url: string | undefined, fallback: string) {
  if (!url) return fallback;
  const path = url.split('?')[0]?.replace(/\/$/, '') ?? '';
  const filename = path.split('/').pop() ?? '';
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? fallback : filename.slice(dot + 1).toLowerCase();
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

function pickedToShowcaseItem(
  picked: PickedAsset,
  patch: { caption?: string; access?: AccessLevel },
): ShowcaseAssetGetItem {
  return {
    assetUuid: picked.result.assetUuid,
    type: picked.asset.type,
    previewUrl: picked.result.previewUrl!,
    videoUrl: picked.result.videoUrl,
    caption: patch.caption,
    access: patch.access ?? 'project',
    size: picked.result.size,
  };
}

function pickedToOtherItem(
  picked: PickedAsset,
  patch: { title?: string; caption?: string; access?: AccessLevel },
): OtherAssetGetItem {
  return {
    assetUuid: picked.result.assetUuid,
    previewUrl: picked.result.previewUrl,
    videoUrl: picked.result.videoUrl,
    assetUrl: picked.result.assetUrl,
    extension: picked.result.extension,
    archivedOriginal: archivedOriginalFromMeta(picked.result.meta),
    size: picked.result.size,
    title: patch.title!,
    caption: patch.caption,
    access: patch.access ?? 'project',
  };
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
  await openIconModal();
}

async function openIconModal() {
  if (!projectData.value.iconAssetUuid || !iconPreviewUrl.value) return;

  let current: AssetReplaceResult = {
    assetUuid: projectData.value.iconAssetUuid,
    slug: projectData.value.iconAssetUuid,
    extension: extensionFromUrl(
      iconVideoUrl.value ?? iconPreviewUrl.value,
      'webp',
    ),
    size: iconSize.value ?? 0,
    previewUrl: iconPreviewUrl.value,
    videoUrl: iconVideoUrl.value,
    assetUrl: iconVideoUrl.value ?? iconPreviewUrl.value,
  };

  while (true) {
    const result = await openModal(projectAssetDetailsModal, {
      asideTitle: phrase.value.project_icon,
      asset: current,
    });

    if (result.type === 'replace') {
      const picked = await pickProjectMediaAsset('project-icon');
      if (!picked) continue;
      current = picked.result;
      applyIconAsset(picked.result);
      continue;
    }

    if (result.type === 'detach') {
      projectData.value.iconAssetUuid = undefined;
      iconPreviewUrl.value = undefined;
      iconVideoUrl.value = undefined;
      iconSize.value = undefined;
    }

    return;
  }
}

// Banner handlers

async function openBannerUpload() {
  const picked = await pickProjectMediaAsset('project-banner');
  if (!picked) return;
  applyBannerAsset(picked.result);
  await openBannerModal();
}

async function openBannerModal() {
  if (!projectData.value.bannerAssetUuid || !bannerPreviewUrl.value) return;

  let current: AssetReplaceResult = {
    assetUuid: projectData.value.bannerAssetUuid,
    slug: projectData.value.bannerAssetUuid,
    extension: extensionFromUrl(
      bannerVideoUrl.value ?? bannerPreviewUrl.value,
      'webp',
    ),
    size: bannerSize.value ?? 0,
    previewUrl: bannerPreviewUrl.value,
    videoUrl: bannerVideoUrl.value,
    assetUrl: bannerVideoUrl.value ?? bannerPreviewUrl.value,
  };

  while (true) {
    const result = await openModal(projectAssetDetailsModal, {
      asideTitle: phrase.value.project_banner,
      asset: current,
    });

    if (result.type === 'replace') {
      const picked = await pickProjectMediaAsset('project-banner');
      if (!picked) continue;
      current = picked.result;
      applyBannerAsset(picked.result);
      continue;
    }

    if (result.type === 'detach') {
      projectData.value.bannerAssetUuid = undefined;
      bannerPreviewUrl.value = undefined;
      bannerVideoUrl.value = undefined;
      bannerSize.value = undefined;
    }

    return;
  }
}

// Showcase handlers

async function openShowcaseAdd() {
  let picked = await pickProjectMediaAsset();
  if (!picked || !picked.result.previewUrl) return;
  let patch: { caption?: string; access?: AccessLevel } = {};

  while (true) {
    const result = await openModal(projectAssetDetailsModal, {
      asideTitle: phrase.value.showcase_details,
      asset: picked.result,
      primaryLabel: phrase.value.showcase_confirm_add,
      showCaption: true,
      initialCaption: patch.caption,
      showAccess: true,
      initialAccess: patch.access,
      showDetach: false,
    });

    if (result.type === 'replace') {
      patch = { caption: result.caption, access: result.access };
      const replacement = await pickProjectMediaAsset();
      if (!replacement || !replacement.result.previewUrl) continue;
      picked = replacement;
      continue;
    }

    if (result.type === 'confirm') {
      addItem(pickedToShowcaseItem(picked, result));
    }

    return;
  }
}

async function openShowcaseAsset(index: number) {
  const snapshot = showcaseItems.value[index];
  if (!snapshot) return;
  let currentAssetUuid = snapshot.assetUuid;
  let current: AssetReplaceResult = {
    assetUuid: snapshot.assetUuid,
    slug: snapshot.assetUuid,
    extension: extensionFromUrl(
      snapshot.videoUrl ?? snapshot.previewUrl,
      'webp',
    ),
    size: snapshot.size,
    previewUrl: snapshot.previewUrl,
    videoUrl: snapshot.videoUrl,
    assetUrl: snapshot.videoUrl ?? snapshot.previewUrl,
  };
  let patch = {
    caption: snapshot.caption,
    access: snapshot.access,
  } satisfies { caption?: string; access?: AccessLevel };

  while (true) {
    const result = await openModal(projectAssetDetailsModal, {
      asideTitle: phrase.value.showcase,
      asset: current,
      primaryLabel: phrase.value.save,
      showCaption: true,
      initialCaption: patch.caption,
      showAccess: true,
      initialAccess: patch.access,
    });

    if (result.type === 'replace') {
      patch = {
        caption: result.caption,
        access: result.access ?? patch.access,
      };
      const picked = await pickProjectMediaAsset();
      if (!picked || !picked.result.previewUrl) continue;
      updateItem(currentAssetUuid, {
        assetUuid: picked.result.assetUuid,
        type: picked.asset.type,
        previewUrl: picked.result.previewUrl,
        videoUrl: picked.result.videoUrl,
        size: picked.result.size,
      } as Partial<ShowcaseAssetGetItem>);
      currentAssetUuid = picked.result.assetUuid;
      current = picked.result;
      continue;
    }

    if (result.type === 'confirm') {
      updateItem(currentAssetUuid, {
        caption: result.caption,
        access: result.access ?? 'project',
      } as Partial<ShowcaseAssetGetItem>);
    } else if (result.type === 'detach') {
      removeItem(currentAssetUuid);
    }

    return;
  }
}

// Other-files handlers

async function openOtherAdd() {
  let picked = await pickAnyProjectAsset();
  if (!picked) return;
  let patch: { title?: string; caption?: string; access?: AccessLevel } = {};

  while (true) {
    const result = await openModal(projectAssetDetailsModal, {
      asideTitle: phrase.value.other_details,
      asset: picked.result,
      archivedOriginal: archivedOriginalFromMeta(picked.result.meta),
      primaryLabel: phrase.value.other_add,
      showTitle: true,
      requireTitle: true,
      initialTitle: patch.title,
      showCaption: true,
      initialCaption: patch.caption,
      captionAsTextarea: true,
      captionLabel: phrase.value.other_description,
      showAccess: true,
      initialAccess: patch.access,
      showDetach: false,
    });

    if (result.type === 'replace') {
      patch = {
        title: result.title,
        caption: result.caption,
        access: result.access,
      };
      const replacement = await pickAnyProjectAsset();
      if (!replacement) continue;
      picked = replacement;
      continue;
    }

    if (result.type === 'confirm') {
      addOtherItem(pickedToOtherItem(picked, result));
    }

    return;
  }
}

async function openOtherAsset(index: number) {
  const snapshot = otherItems.value[index];
  if (!snapshot) return;
  let currentAssetUuid = snapshot.assetUuid;
  let current: AssetReplaceResult = {
    assetUuid: snapshot.assetUuid,
    slug: snapshot.assetUuid,
    extension: snapshot.extension,
    size: snapshot.size,
    previewUrl: snapshot.previewUrl,
    videoUrl: snapshot.videoUrl,
    assetUrl: snapshot.assetUrl,
  };
  let currentArchivedOriginal = snapshot.archivedOriginal;
  let patch = {
    title: snapshot.title,
    caption: snapshot.caption,
    access: snapshot.access,
  } satisfies { title?: string; caption?: string; access?: AccessLevel };

  while (true) {
    const result = await openModal(projectAssetDetailsModal, {
      asideTitle: phrase.value.other_files,
      asset: current,
      archivedOriginal: currentArchivedOriginal,
      primaryLabel: phrase.value.save,
      showTitle: true,
      requireTitle: true,
      initialTitle: patch.title,
      showCaption: true,
      initialCaption: patch.caption,
      captionAsTextarea: true,
      captionLabel: phrase.value.other_description,
      showAccess: true,
      initialAccess: patch.access,
    });

    if (result.type === 'replace') {
      patch = {
        title: result.title ?? patch.title,
        caption: result.caption,
        access: result.access ?? patch.access,
      };
      const picked = await pickAnyProjectAsset();
      if (!picked) continue;
      currentArchivedOriginal = archivedOriginalFromMeta(picked.result.meta);
      updateOtherItem(currentAssetUuid, {
        assetUuid: picked.result.assetUuid,
        previewUrl: picked.result.previewUrl,
        videoUrl: picked.result.videoUrl,
        assetUrl: picked.result.assetUrl,
        extension: picked.result.extension,
        archivedOriginal: currentArchivedOriginal,
        size: picked.result.size,
      } as Partial<OtherAssetGetItem>);
      currentAssetUuid = picked.result.assetUuid;
      current = picked.result;
      continue;
    }

    if (result.type === 'confirm') {
      updateOtherItem(currentAssetUuid, {
        title: result.title!,
        caption: result.caption,
        access: result.access ?? 'project',
      } as Partial<OtherAssetGetItem>);
    } else if (result.type === 'detach') {
      removeOtherItem(currentAssetUuid);
    }

    return;
  }
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
