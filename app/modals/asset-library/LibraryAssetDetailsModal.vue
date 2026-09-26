<script setup lang="ts">
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { AssetType, assetMetaDimensions } from '#layers/thei/shared/asset';
import { describeAssetRecipe } from '#layers/thei/shared/asset-recipe';
import {
  assetSourceKey,
  type AssetPlacement,
  type AssetUsagesResponse,
} from '#layers/thei/shared/asset-library';
import {
  assetFileLabel,
  assetPlacementLabel,
  assetPlacementScopeLabel,
  assetSourceIcon,
  assetSourceLabel,
} from '../../composables/asset-library-labels';
import AssetModal from '../asset-modal/AssetModal.vue';
import AssetModalButton from '../asset-modal/AssetModalButton.vue';
import AssetModalPreviewMedia from '../asset-modal/AssetModalPreviewMedia.vue';
import AssetModalFileInfo from '../asset-modal/AssetModalFileInfo.vue';
import { errorMessage } from '../upload-settings/use-draft-renders';
const props = defineProps<{
  modalData: {
    asset: AssetVariantInfo;
    /** Told when the file's preview was made again, with the file as it is now. */
    onRefreshed?: (asset: AssetVariantInfo) => void;
  };
}>();
const { data, status, error, refresh } = useFetch<AssetUsagesResponse>(
  `/api/admin/assets/${props.modalData.asset.assetUuid}/usages`,
);
const asset = computed(() => data.value?.asset ?? props.modalData.asset);
const videoMeta = computed(() =>
  asset.value.type === AssetType.Video && asset.value.meta
    ? asset.value.meta
    : undefined,
);

/**
 * A video's preview, made again from a frame that shows it. Only videos
 * have one worth remaking: an image's preview is the image, smaller.
 */
const refreshing = ref(false);
const refreshError = ref('');
async function refreshPreview() {
  if (refreshing.value) return;
  refreshing.value = true;
  refreshError.value = '';
  try {
    const updated = await $fetch<AssetVariantInfo>(
      `/api/admin/assets/${asset.value.assetUuid}/preview`,
      { method: 'POST' },
    );
    await refresh();
    props.modalData.onRefreshed?.(updated);
  } catch (reason) {
    refreshError.value = errorMessage(
      reason,
      phrase.value.asset_library_refresh_preview,
    );
  } finally {
    refreshing.value = false;
  }
}
const dimensions = computed(() => assetMetaDimensions(asset.value.meta));
const recipe = computed(() =>
  describeAssetRecipe(asset.value.settings, asset.value.meta, phrase.value),
);
const usageGroups = computed(() => {
  const groups = new Map<
    string,
    { source: AssetPlacement['source']; placements: AssetPlacement[] }
  >();
  for (const placement of data.value?.placements ?? []) {
    const key = assetSourceKey(placement.source);
    const group = groups.get(key) ?? {
      source: placement.source,
      placements: [],
    };
    group.placements.push(placement);
    groups.set(key, group);
  }
  return [...groups.values()];
});
</script>
<template>
  <AssetModal :aside-title="phrase.asset_library_properties">
    <template #preview>
      <AssetModalPreviewMedia
        v-if="asset.media"
        :extension="asset.extension"
        :src="asset.media.src"
        :poster="videoPosterOf(asset.media)"
        :has-audio="asset.media.hasAudio"
      />
      <FilePreview
        v-else
        :extension="asset.extension"
        class="w-1/2 max-w-132 text-text-2"
      />
    </template>
    <template #buttons>
      <AssetModalButton
        v-if="asset.assetUrl"
        icon="arrow-outward"
        target="_blank"
        rel="noopener"
        :href="sitePath(asset.assetUrl)"
        :data-title-popup="phrase.direct_link_to_asset"
        :aria-label="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="asset.type === AssetType.Video"
        :icon="refreshing ? 'loading' : 'refresh'"
        :disabled="refreshing"
        :data-title-popup="phrase.asset_library_refresh_preview_hint"
        :aria-label="phrase.asset_library_refresh_preview"
        @click="refreshPreview"
      />
    </template>
    <template #aside>
      <div class="flex flex-col gap-sm p-sm text-sm">
        <h2 class="text-base font-semibold wrap-anywhere">
          {{ assetFileLabel(asset) }}
        </h2>
        <AssetModalFileInfo
          :extension="asset.extension"
          :size="asset.size"
          :dimensions="dimensions"
          :duration="
            videoMeta && 'duration' in videoMeta
              ? videoMeta.duration
              : undefined
          "
          :archived-original="
            asset.meta && 'archivedOriginal' in asset.meta
              ? asset.meta.archivedOriginal
              : undefined
          "
        />
        <p v-if="refreshError" class="text-text-error" role="alert">
          {{ refreshError }}
        </p>
        <div v-if="recipe" class="rounded-normal bg-bg-1 p-xs">
          <p class="text-xs text-text-3">{{ phrase.asset_library_settings }}</p>
          <p class="mt-1 wrap-anywhere text-text-2 tabular-nums">
            {{ recipe }}
          </p>
        </div>
      </div>
      <div class="border-t border-border-1 p-sm">
        <div class="mb-sm flex flex-col items-start gap-xs">
          <h3 class="font-semibold">{{ phrase.asset_library_usage }}</h3>
          <AssetUsageBadges v-if="data" :counts="data.counts" />
        </div>
        <div v-if="status === 'pending'" role="status">
          <Icon name="loading" />
        </div>
        <button
          v-else-if="error"
          type="button"
          class="cursor-pointer text-text-error"
          @click="refresh()"
        >
          {{ phrase.asset_library_retry }}
        </button>
        <p v-else-if="!data?.placements.length" class="text-sm text-text-3">
          {{ phrase.asset_library_no_usage }}
          {{ phrase.asset_library_unused_hint }}
        </p>
        <ul v-else class="space-y-sm">
          <li
            v-for="group in usageGroups"
            :key="assetSourceKey(group.source)"
            class="rounded-normal bg-bg-1 p-xs text-sm"
          >
            <div class="flex items-center justify-between gap-xs">
              <span class="flex min-w-0 items-center gap-xs text-text-3">
                <Icon
                  :name="assetSourceIcon[group.source.type]"
                  class="shrink-0"
                />
                <span class="truncate">{{
                  assetSourceLabel(group.source)
                }}</span>
              </span>
              <span class="flex shrink-0 items-center gap-xs">
                <a
                  v-if="group.source.url"
                  :href="sitePath(group.source.url)"
                  target="_blank"
                  rel="noopener"
                  :aria-label="phrase.asset_library_view"
                  :data-title-popup="phrase.asset_library_view"
                  class="flex size-7 items-center justify-center rounded-full
                    bg-bg-3 text-text-3 transition hocus:text-accent"
                >
                  <Icon name="visibility" />
                </a>
                <a
                  v-if="group.source.editUrl"
                  :href="sitePath(group.source.editUrl)"
                  target="_blank"
                  rel="noopener"
                  :aria-label="phrase.asset_library_edit"
                  :data-title-popup="phrase.asset_library_edit"
                  class="flex size-7 items-center justify-center rounded-full
                    bg-bg-3 text-text-3 transition hocus:text-accent"
                >
                  <Icon name="edit" />
                </a>
              </span>
            </div>
            <p class="mt-xs font-semibold wrap-anywhere">
              {{ group.source.title }}
            </p>
            <ul class="mt-xs divide-y divide-border-1 border-t border-border-1">
              <li
                v-for="(placement, index) in group.placements"
                :key="`${placement.role}:${placement.scope.kind}:${placement.isPrivate}:${index}`"
                class="py-xs first:pt-xs last:pb-0"
              >
                <div class="flex items-start justify-between gap-xs">
                  <p class="min-w-0 text-text-2">
                    {{ assetPlacementLabel(placement) }}
                  </p>
                  <span
                    v-if="placement.count > 1 || placement.isPrivate"
                    class="flex shrink-0 items-center gap-xs text-xs
                      text-text-3"
                  >
                    <span
                      v-if="placement.count > 1"
                      class="tabular-nums"
                      :aria-label="phrase.asset_library_places(placement.count)"
                      :data-title-popup="
                        phrase.asset_library_places(placement.count)
                      "
                    >
                      ×{{ placement.count }}
                    </span>
                    <Icon
                      v-if="placement.isPrivate"
                      name="lock-close"
                      :aria-label="phrase.asset_private_access"
                      :data-title-popup="phrase.asset_private_access"
                    />
                  </span>
                </div>
                <p
                  v-if="placement.scope.kind !== 'entity'"
                  class="mt-1 text-xs wrap-anywhere"
                >
                  <a
                    :href="sitePath(placement.scope.url)"
                    target="_blank"
                    rel="noopener"
                    class="text-accent"
                  >
                    {{ placement.scope.title }}
                  </a>
                  <span class="text-text-3">
                    · {{ assetPlacementScopeLabel(placement) }}
                  </span>
                </p>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </template>
  </AssetModal>
</template>
