<script setup lang="ts">
import type { AssetUsageCounts } from '#layers/thei/shared/asset-library';
import {
  assetSourceIcon,
  assetSourceLabel,
} from '../composables/asset-library-labels';
/** Without counts yet, one badge waits in their place, as tall as they are. */
defineProps<{ counts?: AssetUsageCounts }>();
const labels = computed(
  () =>
    Object.fromEntries(
      (Object.keys(assetSourceIcon) as (keyof typeof assetSourceIcon)[]).map(
        (type) => [type, assetSourceLabel({ type })],
      ),
    ) as Record<keyof typeof assetSourceIcon, string>,
);
</script>
<template>
  <div
    class="flex flex-wrap items-center justify-end gap-xs text-xs text-text-2"
  >
    <span
      v-if="!counts"
      class="inline-flex animate-pulse items-center gap-1 rounded-normal bg-bg-3
        px-xs py-1 motion-reduce:animate-none"
      aria-hidden="true"
      ><Icon name="link" class="invisible" /><span class="invisible"
        >00</span
      ></span
    >
    <span
      v-for="(count, type) in counts"
      :key="type"
      :aria-label="`${labels[type]}: ${count}`"
      :data-title-popup="labels[type]"
      class="inline-flex items-center gap-1 rounded-normal bg-bg-3 px-xs py-1
        tabular-nums"
      ><Icon :name="assetSourceIcon[type]" />{{ count }}</span
    >
    <span v-if="counts && !Object.keys(counts).length" class="text-text-3"
      >0</span
    >
  </div>
</template>
