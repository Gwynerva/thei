<script lang="ts" setup>
import type { LifeRailTone } from '#layers/thei/shared/life';

withDefaults(defineProps<{ tone?: LifeRailTone }>(), { tone: 'accent' });
</script>

<template>
  <LifeTimelineGrid class="min-h-40 py-sm" aria-hidden="true">
    <div class="relative flex justify-center">
      <span
        class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 sm:w-1"
        :class="tone === 'warning' ? 'bg-text-warning/45' : 'bg-accent/35'"
      ></span>
      <span
        class="mt-sm size-6 animate-pulse rounded-full bg-bg-3 ring-2 ring-bg-1
          sm:mt-md sm:size-8 sm:ring-4"
      ></span>
    </div>
    <div
      class="my-xs animate-pulse rounded-normal border border-border-1 bg-bg-2
        p-md"
    >
      <div class="h-3 w-1/4 rounded bg-bg-4"></div>
      <div class="mt-sm h-6 w-2/3 rounded bg-bg-3"></div>
      <div class="mt-xs h-4 w-4/5 rounded bg-bg-3"></div>
    </div>
  </LifeTimelineGrid>
</template>
