<script lang="ts" setup>
import type { LifeRailTone } from '#layers/thei/shared/life';

withDefaults(defineProps<{ tone?: LifeRailTone }>(), { tone: 'accent' });
</script>

<template>
  <LifeTimelineGrid
    aria-hidden="true"
    :class="{ 'life-line-start--warning': tone === 'warning' }"
  >
    <div class="relative flex h-7 justify-center sm:h-10">
      <span
        class="life-arrow absolute top-0 left-1/2 -translate-x-1/2
          [--life-arrow-half:0.42rem] [--life-arrow-height:0.62rem]
          sm:[--life-arrow-half:0.65rem] sm:[--life-arrow-height:0.9rem]"
      />
      <span
        class="absolute inset-y-0 left-1/2 mt-2 w-0.5 -translate-x-1/2 sm:mt-3
          sm:w-1"
        :class="tone === 'warning' ? 'bg-text-warning/85' : 'bg-accent/75'"
      />
    </div>
  </LifeTimelineGrid>
</template>

<style scoped>
.life-arrow {
  border-right: var(--life-arrow-half) solid transparent;
  border-bottom: var(--life-arrow-height) solid
    var(--life-rail-color, var(--color-accent));
  border-left: var(--life-arrow-half) solid transparent;
}

.life-line-start--warning {
  --life-rail-color: var(--color-text-warning);
}
</style>
