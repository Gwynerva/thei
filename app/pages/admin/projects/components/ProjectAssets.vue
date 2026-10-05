<script lang="ts" setup>
import type {
  AssetReplaceResult,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import {
  launchAssetBatchWizard,
  launchAssetEditor,
  mapAssetVariantToReplaceResult,
  type AssetBatchResult,
} from '#layers/thei/app/composables/asset-wizard';
import type { AssetVariantsResponse } from '#layers/thei/shared/api/asset';
import { AssetType, type AssetMeta } from '#layers/thei/shared/asset';
import {
  anyFileExtensionProfile,
  imageExtensionProfile,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';
import { DEFAULT_ASSET_IMAGE_FORMAT } from '#layers/thei/shared/asset-upload-settings';
import AssetTile from '#layers/thei/app/components/AssetTile.vue';
import AssetPendingTile from '#layers/thei/app/components/AssetPendingTile.vue';
import {
  createPendingUploadList,
  type PendingUpload,
} from '#layers/thei/app/composables/pending-upload';
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
  pendingUploadsKey,
  showcaseItemsKey,
  currentProjectUuidKey,
} from '../composables';
import { assetDetailsModal } from '#layers/thei/app/modals/asset-details/modal';
import { useOrderedAssetList } from '#layers/thei/app/composables/ordered-asset-list';
import { useSingleMediaAsset } from '#layers/thei/app/composables/single-media-asset';

/**
 * A project's files: icon, banner, showcase and the rest. An event, which
 * borrows this form, has only a banner and the rest.
 */
const { kind = 'project' } = defineProps<{ kind?: 'project' | 'event' }>();
const isProject = computed(() => kind === 'project');

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

// Files still going up, shown as tiles of their own at the end of each list
// until they land. The form knows nothing of them: leaving the page asks
// through the count, and leaving lets them go.
const pendingShowcase = shallowRef<readonly PendingUpload[]>([]);
const pendingOther = shallowRef<readonly PendingUpload[]>([]);
const pendingUploads = inject(pendingUploadsKey, undefined);
watch([pendingShowcase, pendingOther], ([showcase, other]) => {
  if (pendingUploads) pendingUploads.value = showcase.length + other.length;
});
const showcaseUploads = createPendingUploadList({
  onLanded: (asset) => placeShowcaseAsset(asset),
  onChange: (uploads) => (pendingShowcase.value = uploads),
});
const otherUploads = createPendingUploadList({
  onLanded: (asset) => placeOtherAsset(asset),
  onChange: (uploads) => (pendingOther.value = uploads),
});
onBeforeUnmount(() => {
  showcaseUploads.dispose();
  otherUploads.dispose();
});

type PickedAsset = {
  asset: AssetVariantInfo;
  result: AssetReplaceResult;
};

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
});

const bannerSlot = useSingleMediaAsset({
  uploadProfile: 'entity-banner',
  asideTitle: () =>
    isProject.value ? phrase.value.project_banner : phrase.value.event_banner,
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

/**
 * The file one pick settled on, when it was a single one: made in the editor,
 * chosen among the variants of a duplicate, or taken from the library. A
 * batch is placed as it is, and each of its tiles is described later.
 */
function singleSettledAsset(result: AssetBatchResult) {
  return result.assets.length === 1 &&
    !result.uploads.length &&
    !result.errors.length
    ? result.assets[0]
    : undefined;
}

function reportBatchErrors(result: AssetBatchResult) {
  batchErrorMessage.value = result.errors
    .map((error) => `${error.fileName}: ${error.message}`)
    .join(' · ');
}

// Showcase handlers

// One flow: the picker, the editor and the details a single file goes on to,
// where its caption is written, replace one another.
function openShowcaseAdd() {
  return runModalFlow(async () => {
    batchErrorMessage.value = '';
    const result = await launchAssetBatchWizard({
      accept: [imageExtensionProfile, videoExtensionProfile],
      maxSize: ASSET_UPLOAD_LIMITS.media,
      sizeLimitPolicy: 'media',
    });
    if (!result) return;
    for (const asset of result.assets) placeShowcaseAsset(asset);
    showcaseUploads.follow(result.uploads);
    reportBatchErrors(result);
    const single = singleSettledAsset(result);
    if (single) await runShowcaseDetails(single.assetUuid);
  });
}

function placeShowcaseAsset(asset: AssetVariantInfo) {
  if (
    (asset.type !== AssetType.Image && asset.type !== AssetType.Video) ||
    !asset.media
  ) {
    return;
  }
  addItem(
    pickedToShowcaseItem(
      { asset, result: mapAssetVariantToReplaceResult(asset) },
      {},
    ),
  );
}

function openShowcaseAsset(index: number) {
  const item = showcaseItems.value[index];
  if (item) return runModalFlow(() => runShowcaseDetails(item.assetUuid));
}

/**
 * A tile's details: its caption and who sees it. "Change" goes through the
 * editor and comes back here; closing keeps the tile as it is.
 */
async function runShowcaseDetails(assetUuid: string) {
  const snapshot = showcaseItems.value.find(
    (item) => item.assetUuid === assetUuid,
  );
  if (!snapshot) return;
  let currentAssetUuid = snapshot.assetUuid;
  let current: AssetReplaceResult = {
    assetUuid: snapshot.assetUuid,
    slug: snapshot.assetUuid,
    extension: extensionFromUrl(snapshot.media.src, DEFAULT_ASSET_IMAGE_FORMAT),
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

function openOtherAdd() {
  return runModalFlow(async () => {
    batchErrorMessage.value = '';
    const result = await launchAssetBatchWizard({
      accept: anyFileExtensionProfile,
      maxSize: ASSET_UPLOAD_LIMITS.file,
      sizeLimitPolicy: 'file',
    });
    if (!result) return;
    for (const asset of result.assets) placeOtherAsset(asset);
    otherUploads.follow(result.uploads);
    reportBatchErrors(result);
    const single = singleSettledAsset(result);
    if (single) await runOtherDetails(single.assetUuid);
  });
}

function placeOtherAsset(asset: AssetVariantInfo) {
  const picked = { asset, result: mapAssetVariantToReplaceResult(asset) };
  addOtherItem(pickedToOtherItem(picked, { title: phrase.value.project_file }));
}

function openOtherAsset(index: number) {
  const item = otherItems.value[index];
  if (item) return runModalFlow(() => runOtherDetails(item.assetUuid));
}

/** A file's details: its title, description and who sees it. */
async function runOtherDetails(assetUuid: string) {
  const snapshot = otherItems.value.find(
    (item) => item.assetUuid === assetUuid,
  );
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
      :title="isProject ? phrase.project_files : phrase.event_files"
      :description="
        isProject
          ? phrase.project_files_description
          : phrase.event_files_description
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
      <div
        class="flex flex-wrap gap-md p-sm sm:p-md"
        :class="{ 'border-b border-border-1': !isProject }"
      >
        <!-- Project Icon -->
        <div v-if="isProject" class="flex flex-1 items-center gap-sm">
          <AssetTile
            :media="iconMedia"
            :overlay="{
              size: iconSize,
              showSize: iconSize != null,
              editable: true,
            }"
            :aria-label="phrase.project_icon"
            class="size-18 shrink-0 cursor-pointer"
            @click="iconSlot.open"
          />
          <div class="tracking-tight">
            <div class="font-semibold">{{ phrase.project_icon }}</div>
            <p class="text-sm text-text-2">{{ phrase.project_icon_hint }}</p>
          </div>
        </div>

        <!-- Banner -->
        <div class="flex flex-1 items-center gap-sm" data-banner-field>
          <AssetTile
            :media="bannerMedia"
            :overlay="{
              size: bannerSize,
              showSize: bannerSize != null,
              editable: true,
            }"
            :aria-label="
              isProject ? phrase.project_banner : phrase.event_banner
            "
            class="aspect-video h-18 shrink-0 cursor-pointer"
            @click="bannerSlot.open"
          />
          <div class="tracking-tight">
            <div class="font-semibold">
              {{ isProject ? phrase.project_banner : phrase.event_banner }}
            </div>
            <p class="text-sm text-text-2">
              {{
                isProject
                  ? phrase.project_banner_hint
                  : phrase.event_banner_hint
              }}
            </p>
            <AssetAspectHint profile="entity-banner" class="mt-1" />
          </div>
        </div>
      </div>

      <!-- Showcase header -->
      <div
        v-if="isProject"
        class="border-y border-border-1 bg-bg-3 px-md py-xs text-sm
          tracking-tight"
      >
        <div class="font-semibold text-text-2">{{ phrase.showcase }}</div>
        <div class="text-text-3">{{ phrase.showcase_description }}</div>
      </div>

      <!-- Showcase grid -->
      <div
        v-if="isProject"
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
            :data-title-popup="publicText(item.caption)"
          >
            {{ publicText(item.caption) }}
          </div>
        </div>

        <AssetPendingTile
          v-for="upload in pendingShowcase"
          :key="upload.id"
          :upload
          class="size-18"
          @cancel="showcaseUploads.forget(upload)"
          @retry="upload.retry()"
        />

        <!-- Add button (always last) -->
        <AssetTile
          :aria-label="phrase.showcase_add"
          class="size-18 cursor-pointer"
          @click="openShowcaseAdd"
        />
      </div>

      <!-- Other-files header -->
      <div
        v-if="isProject"
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
            :data-title-popup="publicText(item.title)"
          >
            {{ publicText(item.title) }}
          </div>
        </div>

        <AssetPendingTile
          v-for="upload in pendingOther"
          :key="upload.id"
          :upload
          class="size-18"
          @cancel="otherUploads.forget(upload)"
          @retry="upload.retry()"
        />

        <AssetTile
          :aria-label="phrase.other_add"
          class="size-18 cursor-pointer"
          @click="openOtherAdd"
        />
      </div>
    </Box>
  </div>
</template>
