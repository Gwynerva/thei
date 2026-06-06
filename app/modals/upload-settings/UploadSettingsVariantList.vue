<script lang="ts" setup>
import { AssetType } from '#layers/thei/shared/asset';

export interface UploadSettingsVariantListItem {
  assetUuid: string;
  title: string;
  extension: string;
  size: number;
  dimensions?: { width: number; height: number };
  type: AssetType;
  hasAudio?: boolean;
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
        <div class="flex justify-between gap-sm font-semibold">
          <span class="truncate">{{ item.title }}</span>
          <span class="shrink-0 font-mono uppercase">
            {{ item.extension }}
          </span>
        </div>
        <div
          class="mt-1 flex flex-wrap items-center gap-x-sm gap-y-1 text-text-3"
        >
          <span>{{ humanSize(item.size) }}</span>
          <span v-if="item.dimensions">
            {{ item.dimensions.width }}x{{ item.dimensions.height }}
          </span>
          <Icon
            v-if="item.type === AssetType.Video"
            :name="item.hasAudio === false ? 'volume-off' : 'volume-on'"
            :class="item.hasAudio === undefined ? 'text-text-3' : 'text-text-2'"
          />
        </div>
      </div>
    </button>
  </div>
</template>
