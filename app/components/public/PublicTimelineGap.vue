<script lang="ts" setup>
import type { LifeGapDuration } from '#layers/thei/shared/life-timeline';

const props = withDefaults(
  defineProps<{ duration: LifeGapDuration; compact?: boolean }>(),
  { compact: false },
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
  <div
    class="grid"
    :class="
      compact
        ? 'grid-cols-[1.75rem_minmax(0,1fr)] gap-xs'
        : `grid-cols-[2rem_minmax(0,1fr)] gap-1
          sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-sm`
    "
  >
    <div class="relative flex justify-center">
      <span
        class="public-timeline-gap-dots absolute inset-y-0 left-1/2 w-1
          -translate-x-1/2 [--timeline-dot-end:0.12rem]
          [--timeline-dot-radius:0.1rem] [--timeline-dot-step:0.55rem]"
        :class="
          compact
            ? 'opacity-30'
            : `opacity-80 sm:w-2 sm:[--timeline-dot-end:0.18rem]
              sm:[--timeline-dot-radius:0.16rem]
              sm:[--timeline-dot-step:0.8rem]`
        "
        aria-hidden="true"
      ></span>
    </div>
    <p
      class="italic"
      :class="
        compact
          ? 'py-sm text-xs text-text-3'
          : 'py-xs text-xs text-text-3 sm:py-sm sm:text-sm'
      "
    >
      {{ label }}
    </p>
  </div>
</template>

<style scoped>
.public-timeline-gap-dots {
  background: var(--color-accent);
  mask-image: radial-gradient(
    circle,
    black 0 var(--timeline-dot-radius),
    transparent var(--timeline-dot-end)
  );
  mask-position: center;
  mask-size: 100% var(--timeline-dot-step);
  mask-repeat: repeat-y;
}
</style>
