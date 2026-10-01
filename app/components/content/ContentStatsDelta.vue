<script lang="ts" setup>
import type { ContentHistoryStats } from '#layers/thei/shared/content-history';
import { CONTENT_HISTORY_MEASURES } from '#layers/thei/app/composables/content-history/measures';

/**
 * How much a version differs from the text as it is now: blocks, words and
 * files, signed from the point of view of restoring it. "−3" means three
 * fewer than now. Equal sizes show "≈": the text differs, its size does not.
 */
const { from, to } = defineProps<{
  from: ContentHistoryStats;
  to: ContentHistoryStats;
}>();

const compactNumber = useCompactNumber();

const items = computed(() =>
  CONTENT_HISTORY_MEASURES.map(({ icon, key }) => ({
    icon,
    delta: to[key] - from[key],
  })).filter((item) => item.delta !== 0),
);

function signed(delta: number) {
  return `${delta > 0 ? '+' : '−'}${compactNumber(Math.abs(delta))}`;
}
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-xs text-xs whitespace-nowrap
      tabular-nums"
  >
    <template v-if="items.length">
      <span
        v-for="item in items"
        :key="item.icon"
        class="inline-flex items-center gap-0.5"
      >
        <Icon :name="item.icon" />{{ signed(item.delta) }}
      </span>
    </template>
    <Icon v-else name="approximate" />
  </span>
</template>
