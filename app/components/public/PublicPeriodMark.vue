<script lang="ts" setup>
import type { PublicPeriodMark } from '#layers/thei/shared/public-timeline';

/**
 * The shape a period is drawn with on a timeline: a dot for a single day, a
 * triangle pointing up at where a period starts and down from where it ends.
 *
 * On its own it sits in an accent disc, as on the chronology rail; `bare`
 * leaves only the shape, in the colour of the text around it.
 */
defineProps<{ kind: PublicPeriodMark; bare?: boolean }>();
</script>

<template>
  <span
    class="flex shrink-0 items-center justify-center"
    :class="
      bare
        ? 'size-3'
        : 'size-5 rounded-full bg-accent text-white ring-2 ring-bg-1'
    "
    aria-hidden="true"
  >
    <span
      v-if="kind === 'day'"
      class="rounded-full bg-current"
      :class="bare ? 'size-1.5' : 'size-2'"
    ></span>
    <span
      v-else
      class="bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]"
      :class="[
        bare ? 'h-2 w-2.5' : 'h-2.5 w-3',
        kind === 'end' ? 'rotate-180' : '',
      ]"
    ></span>
  </span>
</template>
