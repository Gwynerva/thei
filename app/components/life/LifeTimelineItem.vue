<script lang="ts" setup>
import type { LifePoint, LifeRailTone } from '#layers/thei/shared/life';
import { lifeEntityKindIcon } from './life-entity-icon';

const props = withDefaults(
  defineProps<{
    point: LifePoint;
    tone?: LifeRailTone;
    active?: boolean;
    /** First and last point of its day, for the rail masks and the date. */
    first?: boolean;
    last?: boolean;
    /** The first day of a year gets the year drawn above its date. */
    showYear?: boolean;
    dateHref: string;
  }>(),
  { tone: 'accent', active: false, first: false, last: false, showYear: false },
);
const emit = defineEmits<{ pick: [] }>();
const isNew = computed(() => props.tone === 'warning');
const pointIcon = computed(() =>
  props.point.visibility === 'secret'
    ? 'lock-close'
    : lifeEntityKindIcon(props.point.entityKind),
);
</script>

<template>
  <div class="life-item min-w-0">
    <!--
      The day's header is a row of its own rather than something stacked on top
      of the first card: that way the marker below stays level with the card it
      belongs to instead of drifting down by the height of the date.
    -->
    <LifeTimelineGrid v-if="first">
      <TheiLink
        :to="dateHref"
        class="group relative flex cursor-pointer justify-center"
        :aria-label="phrase.life_copy_link"
        @click="emit('pick')"
      >
        <span
          class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 sm:w-1"
          :class="isNew ? 'bg-text-warning/85' : 'bg-accent/75'"
        ></span>
        <span
          class="life-active-rail life-active-rail--start absolute inset-y-0
            left-1/2 w-10 -translate-x-1/2 opacity-0 transition-opacity
            duration-300 group-hocus:opacity-60 motion-reduce:duration-0
            sm:w-14"
          :class="[
            isNew ? 'text-text-warning' : 'text-accent',
            { 'opacity-100': active },
          ]"
          aria-hidden="true"
        >
          <span
            class="life-active-rail-core absolute inset-y-0 left-1/2 w-0.5
              -translate-x-1/2 bg-current sm:w-1"
          ></span>
        </span>
      </TheiLink>
      <LifeDateMarker
        :date="point.date"
        :show-year="showYear"
        :active="active"
        :href="dateHref"
        class="pt-sm sm:pt-md"
        @pick="emit('pick')"
      />
    </LifeTimelineGrid>

    <LifeTimelineGrid class="min-w-0">
      <!--
        The whole segment of rail is the day's own control: a click anywhere on
        it selects the day, rather than making the reader aim at a marker.
      -->
      <TheiLink
        :to="dateHref"
        class="group relative flex cursor-pointer justify-center"
        :aria-label="phrase.life_copy_link"
        @click="emit('pick')"
      >
        <span
          class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 sm:w-1"
          :class="isNew ? 'bg-text-warning/85' : 'bg-accent/75'"
        ></span>
        <span
          class="life-active-rail absolute inset-y-0 left-1/2 w-10
            -translate-x-1/2 opacity-0 transition-opacity duration-300
            group-hocus:opacity-60 motion-reduce:duration-0 sm:w-14"
          :class="[
            isNew ? 'text-text-warning' : 'text-accent',
            {
              'opacity-100': active,
              'life-active-rail--end': last,
            },
          ]"
          aria-hidden="true"
        >
          <span
            class="life-active-rail-core absolute inset-y-0 left-1/2 w-0.5
              -translate-x-1/2 bg-current sm:w-1"
          ></span>
        </span>
        <div class="relative z-1 mt-xs flex flex-col items-center sm:mt-sm">
          <span
            class="life-point-marker flex size-7 items-center justify-center
              rounded-full border-2 border-bg-1 text-sm text-white shadow-md
              shadow-shadow-2 sm:size-10 sm:border-4 sm:text-lg"
            :class="{ 'life-point-marker--warning': isNew }"
          >
            <Icon :name="pointIcon" />
          </span>
          <span
            v-if="isNew"
            class="life-new-marker mt-1 flex size-4 items-center justify-center
              rounded-full border border-bg-1 text-xs text-white shadow-sm
              ring-2 shadow-shadow-2 ring-bg-1 sm:size-5 sm:ring-4"
            aria-hidden="true"
          >
            <Icon name="fire" />
          </span>
        </div>
      </TheiLink>
      <LifePointCard :point="point" class="my-xs" />
    </LifeTimelineGrid>
  </div>
</template>

<style scoped>
.life-point-marker {
  background: radial-gradient(
    circle,
    color-mix(in oklab, var(--color-accent), black 32%) 0%,
    var(--color-accent) 72%
  );
}

.life-point-marker--warning,
.life-new-marker {
  background: radial-gradient(
    circle,
    color-mix(in oklab, var(--color-text-warning), black 32%) 0%,
    var(--color-text-warning) 72%
  );
}

.life-active-rail {
  background: linear-gradient(
    to right,
    transparent,
    color-mix(in oklab, currentColor 9%, transparent) 18%,
    color-mix(in oklab, currentColor 22%, transparent) 50%,
    color-mix(in oklab, currentColor 9%, transparent) 82%,
    transparent
  );
  -webkit-mask-image: var(
    --life-active-rail-mask,
    linear-gradient(black, black)
  );
  mask-image: var(--life-active-rail-mask, linear-gradient(black, black));
}

.life-active-rail-core {
  box-shadow:
    0 0 0.26rem 0.06rem color-mix(in oklab, currentColor 42%, transparent),
    0 0 0.6rem 0.08rem color-mix(in oklab, currentColor 24%, transparent);
}

.life-active-rail--start {
  --life-active-rail-mask: linear-gradient(
    to bottom,
    transparent,
    black 1.5rem
  );
}

.life-active-rail--end {
  --life-active-rail-mask: linear-gradient(
    to bottom,
    black calc(100% - 1.5rem),
    transparent
  );
}

.life-active-rail--both {
  --life-active-rail-mask: linear-gradient(
    to bottom,
    transparent,
    black 1.5rem,
    black calc(100% - 1.5rem),
    transparent
  );
}
</style>
