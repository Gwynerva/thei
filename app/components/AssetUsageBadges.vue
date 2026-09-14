<script setup lang="ts">
import type { AssetUsageCounts } from '#layers/thei/shared/asset-library';
import { assetSourceIcon } from '../composables/asset-library-labels';
defineProps<{ counts: AssetUsageCounts }>();
const labels = computed(() => ({
  project: phrase.value.project,
  event: phrase.value.event,
  page: phrase.value.page,
  tag: phrase.value.tag,
  profile: phrase.value.asset_source_profile,
}));
</script>
<template>
  <div
    class="flex flex-wrap items-center justify-end gap-xs text-xs text-text-2"
  >
    <span
      v-for="(count, type) in counts"
      :key="type"
      :title="labels[type]"
      :aria-label="`${labels[type]}: ${count}`"
      class="inline-flex items-center gap-1 rounded-normal bg-bg-3 px-xs py-1
        tabular-nums"
      ><Icon :name="assetSourceIcon[type]" />{{ count }}</span
    >
    <span v-if="!Object.keys(counts).length" class="text-text-3">0</span>
  </div>
</template>
