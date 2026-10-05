<script lang="ts" setup>
import type { PublicPeriodMark } from '#layers/thei/shared/public-timeline';

/**
 * The shape a period is drawn with on a timeline, read top to bottom as the
 * timeline runs, newest first: a dot for a single day, a triangle pointing up
 * at where a period starts and down from where it ends, the two tip to tip
 * for a whole stretch on one card, and a start cut across into layers for a
 * period that has not ended yet — or, looking back on a day, one that was
 * going on then.
 *
 * On its own it sits in an accent disc, as on the chronology rail; `outline`
 * draws it in the colour of the text around it, inside a thin ring of that
 * colour, as on a card beside the name of its period.
 *
 * A triangle carries its weight towards its base, so one centred by its box
 * looks off-centre: a start sits a tenth of its height higher, an end as much
 * lower.
 */
defineProps<{
  kind: PublicPeriodMark;
  outline?: boolean;
  /** A period yet to come: a quiet disc rather than the accent. */
  muted?: boolean;
}>();
</script>

<template>
  <!-- A disc is positioned so that its ring always lies over the rail it
       sits on, parting it from the line the same on both sides; it is
       shaded as a marker on the life rail is, so the white shape stands out
       of the accent. -->
  <span
    class="flex shrink-0 items-center justify-center"
    :class="
      outline
        ? 'size-5 rounded-full border border-current'
        : [
            'relative size-5 rounded-full ring-2 ring-bg-1',
            muted ? 'bg-bg-3 text-text-3' : 'text-white marker-shade-accent',
          ]
    "
    aria-hidden="true"
  >
    <span
      v-if="kind === 'day'"
      class="rounded-full bg-current"
      :class="outline ? 'size-1.75' : 'size-2'"
    ></span>
    <span v-else-if="kind === 'span'" class="flex flex-col items-center gap-px">
      <span
        class="rotate-180 bg-current
          [clip-path:polygon(50%_0,100%_100%,0_100%)]"
        :class="outline ? 'h-1.25 w-2.25' : 'h-1.5 w-2.5'"
      ></span>
      <span
        class="bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]"
        :class="outline ? 'h-1.25 w-2.25' : 'h-1.5 w-2.5'"
      ></span>
    </span>
    <!-- A start's own triangle, in three layers of equal height. -->
    <svg
      v-else-if="kind === 'ongoing'"
      viewBox="0 0 12 10"
      preserveAspectRatio="none"
      class="-translate-y-1/10"
      :class="outline ? 'h-2.25 w-2.75' : 'h-2.5 w-3'"
    >
      <path
        d="M6 0l1.5 2.5h-3zM3.75 3.75h4.5l1.5 2.5h-7.5zM1.5 7.5h9L12 10H0z"
        fill="currentColor"
      />
    </svg>
    <span
      v-else
      class="bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]"
      :class="[
        outline ? 'h-2.25 w-2.75' : 'h-2.5 w-3',
        kind === 'end' ? 'translate-y-1/10 rotate-180' : '-translate-y-1/10',
      ]"
    ></span>
  </span>
</template>
