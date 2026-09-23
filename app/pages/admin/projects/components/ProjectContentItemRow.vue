<script lang="ts" setup>
import type { ContentAnalysis } from '#layers/thei/shared/content';
import type { DatedPeriod } from '#layers/thei/shared/date-precision';
import ContentStats from '#layers/thei/app/components/content/ContentStats.vue';
import ContentMediaEdge from '#layers/thei/app/components/content/ContentMediaEdge.vue';
import DateRangeChip from '#layers/thei/app/components/DateRangeChip.vue';

defineProps<{
  title: string;
  summary: string;
  periods: DatedPeriod[];
  analysis: ContentAnalysis;
  isPrivate: boolean;
  privateLabel: string;
}>();
defineEmits<{ open: [] }>();
const { engaged, events: mediaEvents } = useMediaInteraction();
</script>

<template>
  <Box
    class="group flex items-stretch overflow-hidden p-0 transition-colors
      hocus:border-border-3"
    v-on="mediaEvents"
  >
    <ContentMediaEdge
      v-if="analysis.preview.media"
      :media="analysis.preview.media"
      :engaged
    />
    <button
      type="button"
      class="relative flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 py-xs
        pr-xs pl-sm text-left sm:py-sm sm:pl-md"
      :class="analysis.preview.media ? 'ml-md sm:ml-12' : undefined"
      @click="$emit('open')"
    >
      <span
        class="content-item-text leading-snug font-semibold wrap-break-word
          transition-colors group-hocus:text-accent"
      >
        {{ title }}
      </span>
      <span
        v-if="summary"
        class="content-item-text line-clamp-2 text-sm wrap-break-word
          text-text-2"
      >
        {{ summary }}
      </span>
      <span v-if="periods.length" class="flex flex-wrap gap-1">
        <DateRangeChip
          v-for="period in periods"
          :key="`${period.startDate}:${period.endDate}`"
          :period="period"
        />
      </span>
      <span
        class="content-item-text flex flex-wrap items-center gap-xs text-sm
          text-text-3"
      >
        <ContentStats v-bind="analysis.summary" size="sm" />
        <span
          v-if="isPrivate"
          class="inline-flex cursor-help items-center gap-1 whitespace-nowrap
            transition-colors hocus:text-text-2"
          :data-title-popup="privateLabel"
        >
          <Icon name="lock-close" />
        </span>
      </span>
    </button>
    <div
      class="relative flex shrink-0 items-center gap-xs py-xs pr-sm sm:pr-md"
    >
      <slot name="actions"></slot>
    </div>
  </Box>
</template>

<style scoped>
/* Keeps the copy legible over light and dark media alike. */
.content-item-text {
  text-shadow:
    0 0 0.5em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.12em 0.45em var(--color-bg-2);
}
</style>
