<script lang="ts" setup>
import type { LifeGapDuration } from '#layers/thei/shared/life-timeline';
import type { LifeRailTone } from '#layers/thei/shared/life';

const props = withDefaults(
  defineProps<{ duration: LifeGapDuration; tone?: LifeRailTone }>(),
  { tone: 'accent' },
);
const hasGap = computed(
  () => props.duration.years + props.duration.months + props.duration.days > 0,
);
const label = computed(() =>
  phrase.value.life_gap(
    props.duration.years,
    props.duration.months,
    props.duration.days,
  ),
);
</script>

<template>
  <LifeTimelineGrid v-if="hasGap">
    <div class="relative flex justify-center">
      <span
        class="life-gap-dots absolute inset-y-0 left-1/2 w-1 -translate-x-1/2
          [--life-dot-end:0.12rem] [--life-dot-radius:0.1rem]
          [--life-dot-step:0.55rem] sm:w-2 sm:[--life-dot-end:0.18rem]
          sm:[--life-dot-radius:0.16rem] sm:[--life-dot-step:0.8rem]"
        :class="`life-gap-dots--${tone}`"
      ></span>
    </div>
    <p class="py-xs text-xs text-text-3 italic sm:py-sm sm:text-sm">
      {{ label }}
    </p>
  </LifeTimelineGrid>
</template>

<style scoped>
.life-gap-dots {
  background: var(--life-gap-fill, var(--color-accent));
  mask-image: radial-gradient(
    circle,
    black 0 var(--life-dot-radius),
    transparent var(--life-dot-end)
  );
  background-position: center;
  mask-position: center;
  mask-size: 100% var(--life-dot-step);
  mask-repeat: repeat-y;
  opacity: 0.78;
}

.life-gap-dots--warning {
  --life-gap-fill: var(--color-text-warning);
}

.life-gap-dots--warning-to-accent {
  --life-gap-fill: linear-gradient(
    to bottom,
    var(--color-text-warning),
    var(--color-accent)
  );
}
</style>
