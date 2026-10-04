<script lang="ts" setup>
import type { PublicPeriodMark } from '#layers/thei/shared/public-timeline';

/**
 * The rail beside one row of a period timeline: the row's mark, and below it
 * the whole stretch of rail on to the next row's mark, as tall as the row is
 * — the period itself, a line on to the next one, the dots of a pause, or
 * nothing under the oldest. Each stretch is one piece, so a pause lays out
 * its dots once, whatever the words beside it make of its height.
 */
defineProps<{
  mark: PublicPeriodMark;
  tail: 'none' | 'line' | 'bar' | 'dots';
  /** A period yet to come: drawn quieter than the ones that happened. */
  muted?: boolean;
}>();
</script>

<template>
  <span class="flex flex-col items-center" aria-hidden="true">
    <PublicPeriodMark :kind="mark" :muted />
    <span
      v-if="tail === 'bar'"
      class="w-1 flex-1"
      :class="muted ? 'bg-border-2' : 'bg-accent'"
    ></span>
    <span v-else-if="tail === 'line'" class="w-0.5 flex-1 bg-accent/80"></span>
    <span v-else-if="tail === 'dots'" class="relative w-full flex-1">
      <PublicTimelineDots />
    </span>
  </span>
</template>
