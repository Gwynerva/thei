<script setup lang="ts">
import type {
  AssetVariantInfo,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import {
  archivedOriginalFromMeta,
  AssetType,
  assetMetaDimensions,
} from '#layers/thei/shared/asset';
import type { IconName } from '#thei/icons';
import { describeAssetRecipe } from '#layers/thei/shared/asset-recipe';
import {
  assetSourceKey,
  type AssetPlacement,
  type AssetUsagesResponse,
} from '#layers/thei/shared/asset-library';
import {
  assetDeletionLabel,
  assetFileLabel,
  assetKindIcon,
  assetKindLabel,
} from '../../composables/asset-library-labels';
import AssetModal from '../asset-modal/AssetModal.vue';
import AssetModalButton from '../asset-modal/AssetModalButton.vue';
import AssetModalPreviewAudio from '../asset-modal/AssetModalPreviewAudio.vue';
import AssetModalPreviewMedia from '../asset-modal/AssetModalPreviewMedia.vue';
import AssetModalFileInfo from '../asset-modal/AssetModalFileInfo.vue';
import AssetPanelSection from '../asset-modal/AssetPanelSection.vue';
import AssetUsageChip from './AssetUsageChip.vue';
import FilePreviewContent from '#layers/thei/app/components/file-preview/FilePreviewContent.vue';
import { isAssetExtensionSafeInline } from '#layers/thei/shared/assets/formats';
import { variantDetail } from '../upload-settings/format-labels';

/**
 * A file of the library, on its own: what it is, its description, where it
 * is used, how it was made, and the other variants of it, any of which the
 * window turns to in place.
 */
const props = defineProps<{
  modalData: {
    asset: AssetVariantInfo;
  };
}>();

/** The variant the window shows: the one it was opened with, or another. */
const shownUuid = ref(props.modalData.asset.assetUuid);
const { data, status, error, refresh } = useFetch<AssetUsagesResponse>(
  () => `/api/admin/assets/${shownUuid.value}/usages`,
);
const { data: family } = useFetch<AssetVariantsResponse>(
  `/api/admin/assets/${props.modalData.asset.assetUuid}/variants`,
);
const asset = computed<AssetVariantInfo>(() => {
  if (data.value?.asset.assetUuid === shownUuid.value) return data.value.asset;
  return (
    family.value?.variants.find(
      (variant) => variant.assetUuid === shownUuid.value,
    ) ?? props.modalData.asset
  );
});
const videoMeta = computed(() =>
  asset.value.type === AssetType.Video && asset.value.meta
    ? asset.value.meta
    : undefined,
);
const audioMeta = computed(() =>
  asset.value.type === AssetType.Audio && asset.value.meta
    ? asset.value.meta
    : undefined,
);
const dimensions = computed(() => assetMetaDimensions(asset.value.meta));
/** A browser opens the file in a tab of its own; any other is downloaded. */
const opensInTab = computed(
  () =>
    !!asset.value.media || isAssetExtensionSafeInline(asset.value.extension),
);
const archivedOriginal = computed(() =>
  archivedOriginalFromMeta(asset.value.meta),
);
const recipe = computed(() =>
  describeAssetRecipe(asset.value.settings, asset.value.meta, phrase.value),
);
/** The places it is used in, each with every way it is used there. */
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
const usagesShown = computed(
  () => data.value?.asset.assetUuid === shownUuid.value,
);
/**
 * A file used nowhere, in one line: what keeps it from cleanup — a text's
 * history, an AI action — or that cleanup takes it.
 */
const unused = computed((): { icon: IconName; line: string; hint: string } =>
  data.value?.inHistory
    ? {
        icon: 'history',
        line: phrase.value.asset_library_history_line,
        hint: phrase.value.asset_library_in_history,
      }
    : data.value?.heldByAi
      ? {
          icon: 'sparkles',
          line: phrase.value.asset_library_held_by_ai_line,
          hint: phrase.value.asset_library_held_by_ai,
        }
      : {
          icon: 'minus',
          line: phrase.value.asset_library_unused_line,
          hint: phrase.value.asset_library_unused_hint,
        },
);
/** Every variant but the one in view: that one is the window itself. */
const otherVariants = computed(() =>
  [...(family.value?.variants ?? [])]
    .filter((variant) => variant.assetUuid !== shownUuid.value)
    .sort((a, b) => a.size - b.size),
);
const humanSize = useHumanSize();
</script>
<template>
  <AssetModal
    :aside-title="assetKindLabel(asset.type)"
    :aside-icon="assetKindIcon[asset.type]"
  >
    <template #preview>
      <AssetModalPreviewMedia
        v-if="asset.media"
        :key="`media:${asset.assetUuid}`"
        :extension="asset.extension"
        :src="asset.media.src"
        :poster="videoPosterOf(asset.media)"
        :has-audio="asset.media.hasAudio"
      />
      <AssetModalPreviewAudio
        v-else-if="asset.type === AssetType.Audio"
        :players="[
          {
            key: asset.assetUuid,
            src: asset.assetUrl,
            extension: asset.extension,
            duration: audioMeta?.duration,
            peaks: audioMeta?.peaks,
          },
        ]"
      />
      <FilePreviewContent
        v-else
        :key="asset.assetUuid"
        :src="asset.assetUrl"
        :extension="asset.extension"
        :size="asset.size"
        :archived-original="archivedOriginal"
        :title="assetFileLabel(asset)"
      />
    </template>
    <template #buttons>
      <AssetModalButton
        v-if="asset.assetUrl && opensInTab"
        icon="arrow-outward"
        target="_blank"
        rel="noopener"
        :href="sitePath(asset.assetUrl)"
        :data-title-popup="phrase.direct_link_to_asset"
        :aria-label="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="asset.assetUrl && !asset.media"
        icon="download"
        :download="downloadName(asset.assetUrl, asset.extension)"
        :href="sitePath(asset.assetUrl)"
        :data-title-popup="phrase.download_asset"
        :aria-label="phrase.download_asset"
        data-asset-download
      />
    </template>
    <template #aside>
      <div class="flex flex-col divide-y divide-border-1 text-sm">
        <AssetPanelSection>
          <AssetModalFileInfo
            :key="asset.assetUuid"
            :extension="asset.extension"
            :size="asset.size"
            :dimensions="dimensions"
            :duration="
              videoMeta && 'duration' in videoMeta
                ? videoMeta.duration
                : audioMeta?.duration
            "
            :channels="audioMeta?.channels"
            :bitrate="audioMeta?.bitrate"
            :archived-original="archivedOriginal"
          />
        </AssetPanelSection>
        <!-- The description is the family's: read and saved through the file
             the window opened with, it stays as typed while the window turns
             to another variant. -->
        <AssetPanelSection>
          <FileDescriptionField :asset-uuid="modalData.asset.assetUuid" />
        </AssetPanelSection>
        <AssetPanelSection
          :title="phrase.asset_library_usage"
          :count="usagesShown ? usageGroups.length : undefined"
          data-asset-usages
        >
          <div
            v-if="status === 'pending' || !usagesShown"
            class="flex flex-col gap-1.5"
            aria-hidden="true"
          >
            <span
              v-for="index in 2"
              :key="index"
              class="h-12 animate-pulse rounded-normal bg-bg-3
                motion-reduce:animate-none"
            ></span>
          </div>
          <button
            v-else-if="error"
            type="button"
            class="cursor-pointer self-start text-text-error"
            @click="refresh()"
          >
            {{ phrase.asset_library_retry }}
          </button>
          <!-- Used nowhere: one quiet line, and why it matters in its hint. -->
          <p
            v-else-if="!usageGroups.length"
            class="flex items-center gap-1.5 text-text-3"
            data-asset-unused
          >
            <Icon :name="unused.icon" />
            {{ unused.line }}
            <span
              class="ml-auto flex cursor-help"
              :aria-label="unused.hint"
              :data-title-popup="unused.hint"
              ><Icon name="question"
            /></span>
          </p>
          <div v-else class="flex flex-col gap-1.5">
            <AssetUsageChip
              v-for="group in usageGroups"
              :key="assetSourceKey(group.source)"
              :source="group.source"
              :placements="group.placements"
            />
          </div>
        </AssetPanelSection>
        <AssetPanelSection v-if="recipe" :title="phrase.asset_library_settings">
          <p class="wrap-anywhere text-text-2 tabular-nums">{{ recipe }}</p>
        </AssetPanelSection>
        <AssetPanelSection
          v-if="otherVariants.length"
          :title="phrase.asset_library_other_variants"
          :count="otherVariants.length"
          data-asset-other-variants
        >
          <div class="-mx-xs flex flex-col">
            <button
              v-for="variant in otherVariants"
              :key="variant.assetUuid"
              type="button"
              class="flex cursor-pointer items-center gap-xs rounded-normal
                px-xs py-1.5 text-left transition-colors hocus:bg-bg-3"
              :data-title-popup="phrase.asset_open_variant"
              :data-asset-variant="variant.assetUuid"
              @click="shownUuid = variant.assetUuid"
            >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-semibold">
                  {{ variant.extension.toUpperCase()
                  }}<template v-if="assetMetaDimensions(variant.meta)">
                    · {{ assetMetaDimensions(variant.meta)!.width }} ×
                    {{ assetMetaDimensions(variant.meta)!.height }}</template
                  >
                </span>
                <span
                  v-if="variantDetail(variant.settings)"
                  class="truncate text-2xs text-text-3"
                  >{{ variantDetail(variant.settings) }}</span
                >
              </span>
              <span class="shrink-0 text-xs text-text-2 tabular-nums">{{
                humanSize(variant.size)
              }}</span>
              <span
                v-if="variant.usageCount"
                class="flex shrink-0 items-center gap-0.5 text-2xs text-text-3
                  tabular-nums"
                :data-title-popup="
                  phrase.asset_variant_usage_count(variant.usageCount)
                "
                ><Icon name="link" />{{ variant.usageCount }}</span
              >
              <Icon
                v-else-if="variant.deleteAfter"
                name="delete"
                class="shrink-0 text-text-error"
                :data-title-popup="assetDeletionLabel(variant.deleteAfter)"
              />
              <Icon
                v-else-if="variant.inHistory"
                name="history"
                class="shrink-0 text-text-3"
                :data-title-popup="phrase.asset_library_in_history"
              />
              <Icon
                v-else-if="variant.heldByAi"
                name="sparkles"
                class="shrink-0 text-text-3"
                :data-title-popup="phrase.asset_library_held_by_ai"
              />
              <Icon name="chevron-right" class="shrink-0 text-text-3" />
            </button>
          </div>
        </AssetPanelSection>
      </div>
    </template>
  </AssetModal>
</template>
