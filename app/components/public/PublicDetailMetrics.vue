<script lang="ts" setup>
import type { PublicDetailPanelData } from './public-detail';

const props = defineProps<{ data: PublicDetailPanelData }>();
/**
 * Only what the page actually holds. A count of headings measured the writing
 * rather than the entity, and said the same thing about every page.
 */
const metrics = computed(() =>
  (props.data.metrics ?? []).filter((metric) => Number(metric.value) > 0),
);
</script>

<template>
  <span
    class="flex w-full min-w-0 flex-wrap items-center justify-center gap-x-xs
      gap-y-1 text-xs text-text-2"
  >
    <span
      v-for="metric in metrics"
      :key="`${metric.icon}:${metric.label}`"
      class="inline-flex items-center gap-1 whitespace-nowrap"
      :data-title-popup="metric.label"
      :aria-label="`${metric.label}: ${metric.value}`"
    >
      <Icon :name="metric.icon" aria-hidden="true" />
      <span class="tabular-nums">{{ metric.value }}</span>
    </span>
  </span>
</template>
