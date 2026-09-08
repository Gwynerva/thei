<script lang="ts" setup>
import type { PublicDetailPanelData } from './public-detail';

const props = defineProps<{
  data: PublicDetailPanelData;
  expanded?: boolean;
}>();
defineEmits<{ toggle: [] }>();
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
  <header
    class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-xs px-sm
      py-xs"
    :class="{ 'border-b border-border-1': expanded }"
  >
    <component :is="expanded ? 'h2' : 'span'" class="font-semibold">
      {{ phrase.public_details_overview }}
    </component>
    <span
      class="flex min-w-0 flex-wrap items-center justify-center gap-x-xs gap-y-1
        text-xs text-text-2"
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
    <button
      type="button"
      class="flex size-9 shrink-0 cursor-pointer items-center justify-center
        rounded-sm bg-bg-3 text-text-2 transition focus-visible:ring-2
        focus-visible:ring-accent focus-visible:outline-none hocus:bg-bg-4
        hocus:text-text-1"
      :aria-label="expanded ? phrase.close_modal : phrase.public_details_expand"
      :aria-expanded="expanded ?? false"
      @click="$emit('toggle')"
    >
      <Icon :name="expanded ? 'close' : 'expand-vertical'" />
    </button>
  </header>
</template>
