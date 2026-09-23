<script lang="ts" setup>
import {
  lifeGapStyle,
  type LifeGapDuration,
} from '#layers/thei/shared/life-timeline';
import type { LifeRailTone } from '#layers/thei/shared/life';

const props = withDefaults(
  defineProps<{ duration: LifeGapDuration; tone?: LifeRailTone }>(),
  { tone: 'accent' },
);
const hasGap = computed(
  () => props.duration.years + props.duration.months + props.duration.days > 0,
);
const style = computed(() => lifeGapStyle(props.duration));
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
    <div
      class="life-gap relative flex justify-center"
      :class="[`life-gap--${style}`, `life-gap--${tone}`]"
    >
      <!--
        One rail at one width and one colour for all three breaks. A pause
        within a month keeps the line going as dashes; up to a season it
        thins to dots; beyond that the line is snapped — the two ends are cut
        on the diagonal and pulled apart sideways.
      -->
      <span
        v-if="style !== 'severed'"
        class="life-gap-rail absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2
          sm:w-1"
      ></span>
      <template v-else>
        <span
          class="life-gap-end life-gap-end--top absolute top-0 left-1/2 w-0.5
            sm:w-1"
          aria-hidden="true"
        ></span>
        <span
          class="life-gap-end life-gap-end--bottom absolute bottom-0 left-1/2
            w-0.5 sm:w-1"
          aria-hidden="true"
        ></span>
      </template>
    </div>
    <p class="py-xs text-xs text-text-3 italic sm:py-sm sm:text-sm">
      {{ label }}
    </p>
  </LifeTimelineGrid>
</template>

<style scoped>
.life-gap {
  --life-gap-fill: var(--color-accent);
}

.life-gap--warning {
  --life-gap-fill: var(--color-text-warning);
}

.life-gap--warning-to-accent {
  --life-gap-fill: linear-gradient(
    to bottom,
    var(--color-text-warning),
    var(--color-accent)
  );
}

.life-gap-rail,
.life-gap-end {
  background: var(--life-gap-fill);
  opacity: 0.7;
}

.life-gap-rail {
  background-position: center;
  mask-position: center;
  mask-repeat: repeat-y;
  mask-size: 100% var(--life-gap-step);
}

/* Within a month: dashes, clearly longer than they are wide. */
.life-gap--dash {
  --life-gap-step: 0.9rem;
}

.life-gap--dash .life-gap-rail {
  mask-image: linear-gradient(
    to bottom,
    black 0 0.5rem,
    transparent 0.5rem 100%
  );
}

/* Up to a season: round dots, tighter and much lighter than the dashes. */
.life-gap--dotted {
  --life-gap-step: 0.5rem;
}

.life-gap--dotted .life-gap-rail {
  mask-image: radial-gradient(
    circle at 50% 50%,
    black 0 0.055rem,
    transparent 0.075rem
  );
  mask-size: 100% var(--life-gap-step);
}

@media (width >= 40rem) {
  .life-gap--dotted .life-gap-rail {
    mask-image: radial-gradient(
      circle at 50% 50%,
      black 0 0.11rem,
      transparent 0.14rem
    );
  }
}

/*
 * Beyond a season: a snapped line. Each end keeps a short stub, cut across on
 * the diagonal and offset sideways from the other, so the break reads as two
 * pieces pulled apart rather than as a very long pause.
 */
.life-gap--severed {
  --life-gap-stub: 0.85rem;
  --life-gap-offset: 0.2rem;
}

@media (width >= 40rem) {
  .life-gap--severed {
    --life-gap-stub: 1.1rem;
    --life-gap-offset: 0.3rem;
  }
}

.life-gap-end {
  height: var(--life-gap-stub);
}

.life-gap-end--top {
  transform: translateX(calc(-50% - var(--life-gap-offset)));
  clip-path: polygon(0% 0%, 100% 0%, 100% 62%, 0% 100%);
}

.life-gap-end--bottom {
  transform: translateX(calc(-50% + var(--life-gap-offset)));
  clip-path: polygon(0% 38%, 100% 0%, 100% 100%, 0% 100%);
}
</style>
