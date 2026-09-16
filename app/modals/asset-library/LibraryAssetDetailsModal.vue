<script setup lang="ts">
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
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
const props = defineProps<{ modalData: { asset: AssetVariantInfo } }>();
const { data, status, error, refresh } = useFetch<AssetUsagesResponse>(
  `/api/admin/assets/${props.modalData.asset.assetUuid}/usages`,
);
const asset = computed(() => data.value?.asset ?? props.modalData.asset);
const dimensions = computed(() =>
  asset.value.meta && 'width' in asset.value.meta
    ? asset.value.meta
    : undefined,
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
        :href="asset.assetUrl"
        :data-title-popup="phrase.direct_link_to_asset"
        :aria-label="phrase.direct_link_to_asset"
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
          :archived-original="
            asset.meta && 'archivedOriginal' in asset.meta
              ? asset.meta.archivedOriginal
              : undefined
          "
        />
        <div v-if="dimensions?.width && dimensions.height" class="text-text-2">
          {{ phrase.asset_library_dimensions }}: {{ dimensions.width }} ×
          {{ dimensions.height }}
        </div>
        <details
          v-if="asset.settings"
          class="rounded-normal bg-bg-1 p-xs text-text-2"
        >
          <summary class="cursor-pointer">
            {{ phrase.asset_library_settings }}
          </summary>
          <pre class="mt-xs text-xs wrap-anywhere whitespace-pre-wrap">{{
            JSON.stringify(asset.settings, null, 2)
          }}</pre>
        </details>
        <div class="text-xs text-text-3">
          SHA-256
          <span class="mt-1 block font-mono break-all select-all">{{
            asset.contentHash
          }}</span>
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
                  :href="group.source.url"
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
                  :href="group.source.editUrl"
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
                    :href="placement.scope.url"
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
