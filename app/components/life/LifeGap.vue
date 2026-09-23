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
      class="life-gap relative flex justify-center [--life-gap-cut-bottom:1rem]
        [--life-gap-cut-top:1rem] [--life-gap-slash:1rem]
        sm:[--life-gap-cut-bottom:1.4rem] sm:[--life-gap-cut-top:1.6rem]
        sm:[--life-gap-slash:1.35rem]"
      :class="[`life-gap--${style}`, `life-gap--${tone}`]"
      aria-hidden="true"
    >
      <!--
        Under a week the rail simply runs on. Past that it is cut by two
        parallel slashes, and what runs between them says how long the pause
        was: a faded line, a dashed one, or nothing at all.
      -->
      <span
        v-if="style === 'none'"
        class="life-gap-rail absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2
          sm:w-1"
      ></span>
      <template v-else>
        <span
          class="life-gap-stub life-gap-stub--top absolute top-0 left-1/2 w-0.5
            -translate-x-1/2 sm:w-1"
        ></span>
        <span
          v-if="style !== 'empty'"
          class="life-gap-middle absolute left-1/2 w-0.5 -translate-x-1/2
            sm:w-1"
        ></span>
        <span
          class="life-gap-stub life-gap-stub--bottom absolute bottom-0 left-1/2
            w-0.5 -translate-x-1/2 sm:w-1"
        ></span>
        <span
          class="life-gap-slash life-gap-slash--top absolute left-1/2 w-0.5
            sm:w-1"
        ></span>
        <span
          class="life-gap-slash life-gap-slash--bottom absolute left-1/2 w-0.5
            sm:w-1"
        ></span>
      </template>
    </div>
    <p
      class="pt-md pb-sm text-sm text-text-3 italic sm:pt-lg sm:pb-md
        sm:text-base"
    >
      {{ label }}
    </p>
  </LifeTimelineGrid>
</template>

<style scoped>
/*
 * The newer end of the gap is drawn in the colour of the day above it and the
 * older end in the colour of the day below, so a gap between a new day and an
 * old one hands the warning over to the accent across its middle.
 */
.life-gap {
  --life-gap-top: var(--color-accent);
  --life-gap-bottom: var(--color-accent);
  --life-gap-opacity: 0.75;
}

.life-gap--warning {
  --life-gap-top: var(--color-text-warning);
  --life-gap-bottom: var(--color-text-warning);
  --life-gap-opacity: 0.85;
}

.life-gap--warning-to-accent {
  --life-gap-top: var(--color-text-warning);
}

.life-gap-rail,
.life-gap-middle {
  background: linear-gradient(
    to bottom,
    var(--life-gap-top),
    var(--life-gap-bottom)
  );
}

.life-gap-rail,
.life-gap-stub,
.life-gap-slash {
  opacity: var(--life-gap-opacity);
}

.life-gap-stub--top,
.life-gap-slash--top {
  background: var(--life-gap-top);
}

.life-gap-stub--bottom,
.life-gap-slash--bottom {
  background: var(--life-gap-bottom);
}

.life-gap-stub--top {
  height: var(--life-gap-cut-top);
}

.life-gap-stub--bottom {
  height: var(--life-gap-cut-bottom);
}

.life-gap-middle {
  top: var(--life-gap-cut-top);
  bottom: var(--life-gap-cut-bottom);
  opacity: 0.3;
}

/* A slash is the rail itself turned by 45°, centred on the cut. */
.life-gap-slash {
  height: var(--life-gap-slash);
  transform: translate(-50%, -50%) rotate(45deg);
}

.life-gap-slash--top {
  top: var(--life-gap-cut-top);
}

.life-gap-slash--bottom {
  top: calc(100% - var(--life-gap-cut-bottom));
}

/* One to three months: the faded line breaks up into clear dashes. */
.life-gap--dashed .life-gap-middle {
  opacity: 0.45;
  mask-image: linear-gradient(to bottom, black 0 55%, transparent 55% 100%);
  mask-position: center;
  mask-repeat: repeat-y;
  mask-size: 100% 0.6rem;
}
</style>
