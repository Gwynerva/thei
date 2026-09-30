<script lang="ts" setup>
import { AssetType } from '#layers/thei/shared/asset';

/**
 * One stored file, described by what it is rather than by what was once done
 * to it. Which encoder ran, whether it was cropped or allowed to grow — none
 * of that is visible a week later, and none of it helps in choosing between
 * two files. Format, size, dimensions, quality and where it is used do.
 */
export interface UploadSettingsVariantListItem {
  assetUuid: string;
  extension: string;
  size: number;
  dimensions?: { width: number; height: number };
  type: AssetType;
  hasAudio?: boolean;
  usageCount: number;
  /** Unused, and when cleanup takes it: an original kept beside a paste. */
  deleteAfter?: number;
  /** Unused, but kept while a version of some text still shows it. */
  inHistory?: boolean;
  isCurrent: boolean;
  /** A word or two on what sets it apart: "Unprocessed", "Medium quality". */
  detail?: string;
  /** How the file was made, for a tooltip; the list itself shows what it is. */
  recipe?: string;
}

defineProps<{
  items: UploadSettingsVariantListItem[];
  selectedUuid: string;
}>();

const emit = defineEmits<{
  select: [assetUuid: string];
}>();

const humanSize = useHumanSize();
</script>

<template>
  <!--
    Laid out like the format list: what the file is on the first line, with
    its size; how it differs on the second, with one mark of where it
    stands — its places, or when the cleanup takes it.
  -->
  <div
    class="flex flex-col gap-1 rounded-normal bg-bg-3 p-1 text-sm"
    role="radiogroup"
    :aria-label="phrase.upload_section_family"
  >
    <button
      v-for="item in items"
      :key="item.assetUuid"
      type="button"
      role="radio"
      :aria-checked="selectedUuid === item.assetUuid"
      class="flex cursor-pointer flex-col gap-0.5 rounded-normal border-2 px-xs
        py-1.5 text-left transition"
      :class="
        selectedUuid === item.assetUuid
          ? 'border-accent bg-bg-accent text-accent'
          : `border-border-1 bg-bg-1 text-text-2 hocus:border-border-3
            hocus:text-text-1`
      "
      :data-title-popup="item.recipe"
      @click="emit('select', item.assetUuid)"
    >
      <span class="flex items-baseline justify-between gap-sm">
        <span class="min-w-0 truncate">
          <span class="font-semibold">{{ item.extension.toUpperCase() }}</span>
          <template v-if="item.dimensions">
            · {{ item.dimensions.width }}×{{ item.dimensions.height }}
          </template>
        </span>
        <span class="shrink-0 text-xs tabular-nums">
          {{ humanSize(item.size) }}
        </span>
      </span>

      <span class="flex items-center justify-between gap-sm text-xs">
        <span class="flex min-w-0 items-center gap-xs text-text-3">
          <span v-if="item.detail" class="truncate">{{ item.detail }}</span>
          <span
            v-if="item.isCurrent"
            class="shrink-0 rounded-full bg-accent/15 px-xs text-accent"
            :data-title-popup="phrase.asset_variant_current"
          >
            {{ phrase.asset_variant_current_tag }}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-xs tabular-nums">
          <Icon
            v-if="item.type === AssetType.Video && item.hasAudio === false"
            name="volume-off"
            class="text-text-3"
            :data-title-popup="phrase.video_no_audio"
          />
          <span
            v-if="item.usageCount"
            class="inline-flex items-center gap-1"
            :data-title-popup="
              phrase.asset_variant_usage_count(item.usageCount)
            "
          >
            <Icon name="link" />
            {{ item.usageCount }}
          </span>
          <Icon
            v-else-if="item.deleteAfter"
            name="delete"
            class="text-text-error"
            :data-title-popup="assetDeletionLabel(item.deleteAfter)"
            data-asset-pending-deletion
          />
          <Icon
            v-else-if="item.inHistory"
            name="history"
            class="text-text-3"
            :data-title-popup="phrase.asset_library_in_history"
            data-asset-in-history
          />
          <span
            v-else
            class="inline-flex items-center gap-1 text-text-3"
            :data-title-popup="phrase.asset_variant_usage_count(0)"
          >
            <Icon name="link" />
            0
          </span>
        </span>
      </span>
    </button>
  </div>
</template>
