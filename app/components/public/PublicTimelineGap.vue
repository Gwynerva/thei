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
      <PublicTimelineDots :compact />
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
