<script lang="ts" setup>
import { AssetType } from '#layers/thei/shared/asset';

/**
 * One stored file, described by what it is rather than by what was once done
 * to it. Which encoder ran, whether it was cropped or allowed to grow — none
 * of that is visible a week later, and none of it helps in choosing between
 * two files. Format, size, dimensions and where it is used do.
 */
export interface UploadSettingsVariantListItem {
  assetUuid: string;
  extension: string;
  size: number;
  dimensions?: { width: number; height: number };
  type: AssetType;
  hasAudio?: boolean;
  usageCount: number;
  isCurrent: boolean;
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
  <div class="flex flex-col gap-xs">
    <button
      v-for="item in items"
      :key="item.assetUuid"
      type="button"
      class="cursor-pointer rounded-normal border-2 p-xs text-left text-sm
        transition"
      :class="
        selectedUuid === item.assetUuid
          ? 'border-accent bg-bg-accent text-accent'
          : 'border-border-1 bg-bg-1 text-text-2 hocus:border-border-3'
      "
      @click="emit('select', item.assetUuid)"
    >
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-x-sm gap-y-1">
          <span
            class="shrink-0 font-mono font-semibold uppercase"
            :data-title-popup="phrase.file_info_extension"
          >
            {{ item.extension }}
          </span>
          <span
            v-if="item.dimensions"
            :data-title-popup="phrase.file_info_dimensions"
          >
            {{ item.dimensions.width }}x{{ item.dimensions.height }}
          </span>
          <span :data-title-popup="phrase.file_info_size">
            {{ humanSize(item.size) }}
          </span>
          <span
            class="inline-flex items-center gap-1"
            :data-title-popup="
              phrase.asset_variant_usage_count(item.usageCount)
            "
          >
            <Icon name="link" />
            {{ item.usageCount }}
          </span>
          <Icon
            v-if="item.type === AssetType.Video"
            :name="item.hasAudio === false ? 'volume-off' : 'volume-on'"
            :data-title-popup="
              item.hasAudio === false
                ? phrase.video_no_audio
                : phrase.video_volume
            "
            :class="item.hasAudio === undefined ? 'text-text-3' : 'text-text-2'"
          />
        </div>
        <div v-if="item.isCurrent" class="mt-1">
          <span
            class="inline-block rounded-full bg-accent/15 px-xs text-xs
              text-accent"
          >
            {{ phrase.asset_variant_current }}
          </span>
        </div>
      </div>
    </button>
  </div>
</template>
