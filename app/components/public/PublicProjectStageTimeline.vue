<script lang="ts" setup>
import type { PublicProjectStage } from '#layers/thei/shared/api/public';
import {
  publicTimelineGapDuration,
  publicTimelineHasGap,
} from '#layers/thei/shared/public-timeline';

const props = defineProps<{ items: PublicProjectStage[] }>();

function gapDuration(index: number) {
  const newer = props.items[index - 1];
  const older = props.items[index];
  if (!newer || !older) return { years: 0, months: 0, days: 0 };
  return publicTimelineGapDuration(newer.period, older.period);
}
</script>

<template>
  <ol v-if="items.length" class="relative">
    <template v-for="(item, index) in items" :key="item.href">
      <li v-if="index && publicTimelineHasGap(gapDuration(index))">
        <PublicTimelineGap :duration="gapDuration(index)" />
      </li>
      <li
        class="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-1
          sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-sm"
      >
        <div class="relative flex justify-center">
          <span
            class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2
              bg-accent/75 sm:w-1"
            aria-hidden="true"
          ></span>
          <span
            class="relative z-1 mt-sm flex size-7 items-center justify-center
              rounded-full border-2 border-bg-1 bg-accent shadow-md
              shadow-shadow-2 sm:mt-md sm:size-10 sm:border-4"
            aria-hidden="true"
          >
            <span class="size-2 rounded-full bg-white sm:size-3"></span>
          </span>
        </div>
        <PublicProjectChildCard :item="item" kind="stage" class="my-xs" />
      </li>
    </template>
  </ol>
</template>
