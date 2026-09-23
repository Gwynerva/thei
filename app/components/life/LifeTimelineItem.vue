<script lang="ts" setup>
import type { LifePoint, LifeRailTone } from '#layers/thei/shared/life';
import { lifeEntityKindIcon } from './life-entity-icon';

const props = withDefaults(
  defineProps<{
    point: LifePoint;
    tone?: LifeRailTone;
    active?: boolean;
    /**
     * The reader is pointing at this day somewhere. A day spans several rows
     * of the feed, so the hover is tracked by the feed and handed to each; the
     * glow along the rail is drawn by the feed too, once for the whole day.
     */
    highlighted?: boolean;
    /** The first point of its day carries the date. */
    first?: boolean;
    /** The first day of a year gets the year drawn above its date. */
    showYear?: boolean;
    dateHref: string;
  }>(),
  {
    tone: 'accent',
    active: false,
    highlighted: false,
    first: false,
    showYear: false,
  },
);
const emit = defineEmits<{ pick: []; hover: [boolean] }>();
const isNew = computed(() => props.tone === 'warning');
const pointIcon = computed(() =>
  props.point.visibility === 'secret'
    ? 'lock-close'
    : lifeEntityKindIcon(props.point.entityKind),
);
</script>

<template>
  <LifeTimelineGrid
    class="life-item min-w-0"
    :class="{ 'gap-y-0 sm:gap-y-0': first }"
  >
    <!--
      The whole segment of rail is the day's own control: a click anywhere on
      it selects the day, rather than making the reader aim at a marker. The
      day's header and its first card share this grid, so the rail beside them
      is one control rather than two that light up separately. The header
      still takes a row of its own and the rail follows it through a subgrid,
      which keeps the marker level with the card instead of the date.
    -->
    <TheiLink
      :to="dateHref"
      class="relative grid cursor-pointer justify-items-center"
      :class="{ 'row-span-2 grid-rows-subgrid': first }"
      :aria-label="phrase.life_copy_link"
      @click="emit('pick')"
      @pointerenter="emit('hover', true)"
      @pointerleave="emit('hover', false)"
      @focus="emit('hover', true)"
      @blur="emit('hover', false)"
    >
      <span
        class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 sm:w-1"
        :class="isNew ? 'bg-text-warning/85' : 'bg-accent/75'"
      ></span>
      <div
        class="relative z-1 mt-sm flex flex-col items-center"
        :class="{ 'row-start-2': first }"
      >
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
            rounded-full border border-bg-1 text-xs text-white shadow-sm ring-2
            shadow-shadow-2 ring-bg-1 sm:size-5 sm:ring-4"
          aria-hidden="true"
        >
          <Icon name="fire" />
        </span>
      </div>
    </TheiLink>
    <LifeDateMarker
      v-if="first"
      :date="point.date"
      :show-year="showYear"
      :active="active"
      :highlighted="highlighted"
      :href="dateHref"
      class="pt-sm sm:pt-md"
      @pick="emit('pick')"
      @hover="emit('hover', $event)"
    />
    <!--
      The day's header already dates every card under it. A card keeps its
      own date only when it says more: the span of a merged start and end,
      or a date the owner is not sure of.
    -->
    <LifePointCard
      :point="point"
      :hide-date="!point.period && !point.precision"
      on-rail
      class="my-sm"
    />
  </LifeTimelineGrid>
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
</style>
