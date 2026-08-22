<script lang="ts" setup>
import type {
  AssetReplaceResult,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import {
  launchAssetBatchWizard,
  launchAssetEditor,
  launchAssetWizard,
  mapAssetVariantToReplaceResult,
} from '#layers/thei/app/composables/asset-wizard';
import type { AssetVariantsResponse } from '#layers/thei/shared/api/asset';
import {
  AssetType,
  assetSourceName,
  type AssetMeta,
} from '#layers/thei/shared/asset';
import {
  anyFileExtensionProfile,
  imageExtensionProfile,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';
import AssetTile from '#layers/thei/app/components/AssetTile.vue';
import type {
  OtherAssetGetItem,
  ShowcaseAssetGetItem,
} from '#layers/thei/shared/api/project';
import { projectAssetUsageDelta } from '#layers/thei/shared/admin/project';
import {
  projectDataInjectionKey,
  savedProjectDataInjectionKey,
  iconMediaKey,
  bannerMediaKey,
  iconSizeKey,
  bannerSizeKey,
  otherItemsKey,
  showcaseItemsKey,
  currentProjectUuidKey,
} from '../composables';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { assetDetailsModal } from '#layers/thei/app/modals/asset-details/modal';
import { useOrderedAssetList } from '#layers/thei/app/composables/ordered-asset-list';
import { useSingleMediaAsset } from '#layers/thei/app/composables/single-media-asset';

const { filesOnly = false } = defineProps<{ filesOnly?: boolean }>();

const projectData = inject(projectDataInjectionKey)!;
const savedProjectData = inject(savedProjectDataInjectionKey)!;
const iconMedia = inject(iconMediaKey)!;
const bannerMedia = inject(bannerMediaKey)!;
const iconSize = inject(iconSizeKey)!;
const bannerSize = inject(bannerSizeKey)!;
const showcaseItems = inject(showcaseItemsKey)!;
const otherItems = inject(otherItemsKey)!;
const currentProjectUuid = inject(currentProjectUuidKey)!;
const batchErrorMessage = ref('');
const showcaseRoot = useTemplateRef<HTMLElement>('showcaseRoot');
const otherRoot = useTemplateRef<HTMLElement>('otherRoot');

type PickedAsset = {
  asset: AssetVariantInfo;
  result: AssetReplaceResult;
};

function archivedOriginalFromMeta(meta: AssetMeta | null | undefined) {
  return meta && 'archivedOriginal' in meta ? meta.archivedOriginal : undefined;
}

function assetTitleFromMeta(meta: AssetMeta | null | undefined) {
  return assetSourceName(meta)?.replace(/\.[^.]+$/, '');
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
    maxSize: ASSET_UPLOAD_LIMITS.media,
    sizeLimitPolicy: 'media',
    uploadProfile,
  });
  if (
    !asset ||
    (asset.type !== AssetType.Image && asset.type !== AssetType.Video)
  ) {
    return undefined;
  }

  const result = mapAssetVariantToReplaceResult(asset);
  return result.media ? { asset, result } : undefined;
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

async function editProjectAsset(
  assetUuid: string,
  options: Parameters<typeof launchAssetEditor>[1],
): Promise<PickedAsset | undefined> {
  try {
    const family = await $fetch<AssetVariantsResponse>(
      `/api/admin/assets/${assetUuid}/variants`,
    );
    const current = family.variants.find(
      (variant) => variant.assetUuid === assetUuid,
    );
    if (!current) return undefined;
    const asset = await launchAssetEditor(current, {
      ...options,
      usageDelta: projectAssetUsageDelta(
        projectData.value,
        savedProjectData.value,
      ),
    });
    return asset
      ? { asset, result: mapAssetVariantToReplaceResult(asset) }
      : undefined;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

const iconSlot = useSingleMediaAsset({
  uploadProfile: 'project-icon',
  asideTitle: () => phrase.value.project_icon,
  getAssetUuid: () => projectData.value.iconAssetUuid,
  setAssetUuid: (assetUuid) => {
    projectData.value.iconAssetUuid = assetUuid;
  },
  media: iconMedia,
  size: iconSize,
  usageDelta: () =>
    projectAssetUsageDelta(projectData.value, savedProjectData.value),
  afterDetach: async () => {
    if (!currentProjectUuid.value) return;
    iconMedia.value = await $fetch<MediaDescriptor>(
      `/api/generated-icons/project/${encodeURIComponent(currentProjectUuid.value)}`,
    );
  },
});

const bannerSlot = useSingleMediaAsset({
  uploadProfile: 'project-banner',
  asideTitle: () => phrase.value.project_banner,
  getAssetUuid: () => projectData.value.bannerAssetUuid,
  setAssetUuid: (assetUuid) => {
    projectData.value.bannerAssetUuid = assetUuid;
  },
  media: bannerMedia,
  size: bannerSize,
  usageDelta: () =>
    projectAssetUsageDelta(projectData.value, savedProjectData.value),
});

function pickedToShowcaseItem(
  picked: PickedAsset,
  patch: { caption?: string; isPrivate?: boolean },
): ShowcaseAssetGetItem {
  return {
    assetUuid: picked.result.assetUuid,
    type: picked.asset.type,
    media: picked.result.media!,
    caption: patch.caption,
    isPrivate: patch.isPrivate ?? false,
    size: picked.result.size,
  };
}

function pickedToOtherItem(
  picked: PickedAsset,
  patch: { title?: string; caption?: string; isPrivate?: boolean },
): OtherAssetGetItem {
  return {
    assetUuid: picked.result.assetUuid,
    media: picked.result.media,
    assetUrl: picked.result.assetUrl,
    extension: picked.result.extension,
    archivedOriginal: archivedOriginalFromMeta(picked.result.meta),
    size: picked.result.size,
    title: patch.title!,
    caption: patch.caption,
    isPrivate: patch.isPrivate ?? false,
  };
}

// Showcase asset list

const { addItem, updateItem, removeItem, dragSort } = useOrderedAssetList(
  showcaseItems,
  (items) => {
    projectData.value.showcaseAssets = items.map((item) => ({
      assetUuid: item.assetUuid,
      caption: item.caption,
      isPrivate: item.isPrivate,
    }));
  },
  showcaseRoot,
);

const {
  addItem: addOtherItem,
  updateItem: updateOtherItem,
  removeItem: removeOtherItem,
  dragSort: otherDragSort,
} = useOrderedAssetList(
  otherItems,
  (items) => {
    projectData.value.otherAssets = items.map((item) => ({
      assetUuid: item.assetUuid,
      title: item.title,
      caption: item.caption,
      isPrivate: item.isPrivate,
    }));
  },
  otherRoot,
);

// Showcase handlers

async function openShowcaseAdd() {
  batchErrorMessage.value = '';
  const result = await launchAssetBatchWizard({
    accept: [imageExtensionProfile, videoExtensionProfile],
    maxSize: ASSET_UPLOAD_LIMITS.media,
    sizeLimitPolicy: 'media',
  });
  if (!result) return;
  for (const asset of result.assets) {
    if (
      (asset.type !== AssetType.Image && asset.type !== AssetType.Video) ||
      !asset.media
    ) {
      continue;
    }
    addItem(
      pickedToShowcaseItem(
        { asset, result: mapAssetVariantToReplaceResult(asset) },
        {},
      ),
    );
  }
  batchErrorMessage.value = result.errors
    .map((error) => `${error.fileName}: ${error.message}`)
    .join(' · ');
}

async function openShowcaseAsset(index: number) {
  const snapshot = showcaseItems.value[index];
  if (!snapshot) return;
  let currentAssetUuid = snapshot.assetUuid;
  let current: AssetReplaceResult = {
    assetUuid: snapshot.assetUuid,
    slug: snapshot.assetUuid,
    extension: extensionFromUrl(snapshot.media.src, 'webp'),
    size: snapshot.size,
    media: snapshot.media,
    assetUrl: snapshot.media.src,
  };
  let patch = {
    caption: snapshot.caption,
    isPrivate: snapshot.isPrivate,
  } satisfies { caption?: string; isPrivate?: boolean };

  while (true) {
    const result = await openModal(assetDetailsModal, {
      asideTitle: phrase.value.showcase_file,
      asset: current,
      primaryLabel: phrase.value.save,
      showCaption: true,
      initialCaption: patch.caption,
      showAccess: true,
      initialIsPrivate: patch.isPrivate,
    });

    if (result.type === 'replace') {
      patch = {
        caption: result.caption,
        isPrivate: result.isPrivate ?? patch.isPrivate,
      };
      const picked = await editProjectAsset(currentAssetUuid, {
        accept: [imageExtensionProfile, videoExtensionProfile],
        maxSize: ASSET_UPLOAD_LIMITS.media,
        sizeLimitPolicy: 'media',
      });
      if (!picked || !picked.result.media) continue;
      updateItem(currentAssetUuid, {
        assetUuid: picked.result.assetUuid,
        type: picked.asset.type,
        media: picked.result.media,
        size: picked.result.size,
      } as Partial<ShowcaseAssetGetItem>);
      currentAssetUuid = picked.result.assetUuid;
      current = picked.result;
      continue;
    }

    if (result.type === 'confirm') {
      updateItem(currentAssetUuid, {
        caption: result.caption,
        isPrivate: result.isPrivate ?? false,
      } as Partial<ShowcaseAssetGetItem>);
    } else if (result.type === 'detach') {
      removeItem(currentAssetUuid);
    }

    return;
  }
}

// Other-files handlers

async function openOtherAdd() {
  batchErrorMessage.value = '';
  const result = await launchAssetBatchWizard({
    accept: anyFileExtensionProfile,
    maxSize: ASSET_UPLOAD_LIMITS.file,
    sizeLimitPolicy: 'file',
  });
  if (!result) return;
  for (const asset of result.assets) {
    const picked = {
      asset,
      result: mapAssetVariantToReplaceResult(asset),
    };
    addOtherItem(
      pickedToOtherItem(picked, {
        title:
          assetTitleFromMeta(asset.meta) ??
          `${asset.assetUuid}.${asset.extension}`,
      }),
    );
  }
  batchErrorMessage.value = result.errors
    .map((error) => `${error.fileName}: ${error.message}`)
    .join(' · ');
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
    media: snapshot.media,
    assetUrl: snapshot.assetUrl,
  };
  let currentArchivedOriginal = snapshot.archivedOriginal;
  let patch = {
    title: snapshot.title,
    caption: snapshot.caption,
    isPrivate: snapshot.isPrivate,
  } satisfies { title?: string; caption?: string; isPrivate?: boolean };

  while (true) {
    const result = await openModal(assetDetailsModal, {
      asideTitle: phrase.value.project_file,
      asset: current,
      archivedOriginal: currentArchivedOriginal,
      primaryLabel: phrase.value.save,
      showTitle: true,
      requireTitle: true,
      initialTitle: patch.title,
      showCaption: true,
      initialCaption: patch.caption,
      captionAsTextarea: true,
      captionPlaceholder: phrase.value.other_description,
      showAccess: true,
      initialIsPrivate: patch.isPrivate,
    });

    if (result.type === 'replace') {
      patch = {
        title: result.title ?? patch.title,
        caption: result.caption,
        isPrivate: result.isPrivate ?? patch.isPrivate,
      };
      const picked = await editProjectAsset(currentAssetUuid, {
        accept: anyFileExtensionProfile,
        maxSize: ASSET_UPLOAD_LIMITS.file,
        sizeLimitPolicy: 'file',
      });
      if (!picked) continue;
      currentArchivedOriginal = archivedOriginalFromMeta(picked.result.meta);
      updateOtherItem(currentAssetUuid, {
        assetUuid: picked.result.assetUuid,
        media: picked.result.media,
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
        isPrivate: result.isPrivate ?? false,
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
      :title="filesOnly ? phrase.event_files : phrase.project_files"
      :description="
        filesOnly
          ? phrase.event_files_description
          : phrase.project_files_description
      "
      class="mb-md"
    />
    <Box class="flex flex-col">
      <div
        v-if="batchErrorMessage"
        class="border-b border-border-error bg-bg-error px-md py-sm text-sm
          text-text-error"
      >
        <Icon name="warning" class="mr-xs" />
        {{ batchErrorMessage }}
      </div>
      <div v-if="!filesOnly" class="flex flex-wrap gap-md p-sm sm:p-md">
        <!-- Project Icon -->
        <div class="flex flex-1 items-center gap-sm">
          <AssetTile
            :media="iconMedia"
            :overlay="{
              size: iconSize,
              showSize: iconSize != null,
              editable: true,
            }"
            :aria-label="phrase.project_icon"
            class="size-18 cursor-pointer"
            @click="iconSlot.open"
          />
          <div class="tracking-tight">
            <div class="font-semibold">{{ phrase.project_icon }}</div>
            <p class="text-sm text-text-2">{{ phrase.project_icon_hint }}</p>
          </div>
        </div>

        <!-- Project Banner -->
        <div class="flex flex-1 items-center gap-sm">
          <AssetTile
            :media="bannerMedia"
            :overlay="{
              size: bannerSize,
              showSize: bannerSize != null,
              editable: true,
            }"
            :aria-label="phrase.project_banner"
            class="aspect-video h-18 cursor-pointer"
            @click="bannerSlot.open"
          />
          <div class="tracking-tight">
            <div class="font-semibold">{{ phrase.project_banner }}</div>
            <p class="text-sm text-text-2">{{ phrase.project_banner_hint }}</p>
          </div>
        </div>
      </div>

      <!-- Showcase header -->
      <div
        v-if="!filesOnly"
        class="border-y border-border-1 bg-bg-3 px-md py-xs text-sm
          tracking-tight"
      >
        <div class="font-semibold text-text-2">{{ phrase.showcase }}</div>
        <div class="text-text-3">{{ phrase.showcase_description }}</div>
      </div>

      <!-- Showcase grid -->
      <div
        v-if="!filesOnly"
        ref="showcaseRoot"
        class="flex flex-wrap gap-sm p-sm sm:p-md"
      >
        <!-- Existing showcase items -->
        <div
          v-for="(item, index) in showcaseItems"
          :key="item.assetUuid"
          :data-drag-id="item.assetUuid"
          class="flex w-18 flex-col items-center gap-xs"
        >
          <AssetTile
            :media="item.media"
            :overlay="{
              size: item.size,
              showSize: true,
              isPrivate: item.isPrivate,
              editable: true,
            }"
            :aria-label="phrase.showcase_details"
            class="size-18 cursor-grab active:cursor-grabbing"
            @click="dragSort.guardClick(() => openShowcaseAsset(index))"
          />
          <div
            v-if="item.caption"
            class="line-clamp-2 w-full cursor-help text-center text-xs
              wrap-break-word text-text-2"
            :data-title-popup="item.caption"
          >
            {{ item.caption }}
          </div>
        </div>

        <!-- Add button (always last) -->
        <AssetTile
          :aria-label="phrase.showcase_add"
          class="size-18 cursor-pointer"
          @click="openShowcaseAdd"
        />
      </div>

      <!-- Other-files header -->
      <div
        v-if="!filesOnly"
        class="border-y border-border-1 bg-bg-3 px-md py-xs text-sm
          tracking-tight"
      >
        <div class="font-semibold text-text-2">{{ phrase.other_files }}</div>
        <div class="text-text-3">{{ phrase.other_files_description }}</div>
      </div>

      <!-- Other-files grid -->
      <div ref="otherRoot" class="flex flex-wrap gap-sm p-sm sm:p-md">
        <div
          v-for="(item, index) in otherItems"
          :key="item.assetUuid"
          :data-drag-id="item.assetUuid"
          class="flex w-18 flex-col items-center gap-xs"
        >
          <AssetTile
            :media="item.media"
            :extension="item.extension"
            :overlay="{
              size: item.size,
              showSize: true,
              isPrivate: item.isPrivate,
              editable: true,
            }"
            :aria-label="phrase.other_details"
            class="size-18 cursor-grab active:cursor-grabbing"
            @click="otherDragSort.guardClick(() => openOtherAsset(index))"
          />
          <div
            class="line-clamp-2 w-full cursor-help text-center text-xs
              wrap-break-word text-text-2"
            :data-title-popup="item.title"
          >
            {{ item.title }}
          </div>
        </div>

        <AssetTile
          :aria-label="phrase.other_add"
          class="size-18 cursor-pointer"
          @click="openOtherAdd"
        />
      </div>
    </Box>
  </div>
</template>
