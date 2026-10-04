<script lang="ts" setup>
import type { PublicPeriodMark } from '#layers/thei/shared/public-timeline';

/**
 * The rail beside one row of a period timeline: the period's mark, and below
 * it the rail running on for as tall as the row is — the period itself, a
 * line on to the next one, the dots of a pause before it, or nothing.
 */
defineProps<{
  mark: PublicPeriodMark;
  tail: 'none' | 'line' | 'bar' | 'dots';
}>();
</script>

<template>
  <span class="flex flex-col items-center" aria-hidden="true">
    <PublicPeriodMark :kind="mark" />
    <span v-if="tail === 'bar'" class="w-1 flex-1 bg-accent"></span>
    <span v-else-if="tail === 'line'" class="w-0.5 flex-1 bg-accent/80"></span>
    <span v-else-if="tail === 'dots'" class="relative w-full flex-1">
      <PublicTimelineDots compact />
    </span>
  </span>
</template>
