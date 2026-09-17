<script lang="ts" setup>
import type { PublicDetailPanelData } from './public-detail';

const props = defineProps<{ data: PublicDetailPanelData }>();
const metrics = computed(() => [
  ...(props.data.contents?.length
    ? [
        {
          icon: 'heading' as const,
          label: phrase.value.public_details_contents,
          value: props.data.contents.length,
        },
      ]
    : []),
  ...(props.data.metrics ?? []).filter((metric) => Number(metric.value) > 0),
]);
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
