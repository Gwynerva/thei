<script lang="ts" setup>
import { buildLifeUrl, type LifeDay } from '#layers/thei/shared/life';

const props = defineProps<{ day: LifeDay }>();
const isAdmin = useIsAdmin();
const publicHeader = useStickyHeaderContext();
const top = computed(
  () =>
    `calc(${isAdmin.value ? 'var(--height-admin-bar) + ' : ''}${publicHeader?.height.value ?? 0}px)`,
);
const date = computed(() => new Date(`${props.day.date}T00:00:00Z`));
const year = computed(() => props.day.date.slice(0, 4));
const month = computed(() => props.day.date.slice(0, 7));
const dayValue = computed(() =>
  new Intl.DateTimeFormat(language.value.code, { day: 'numeric' }).format(
    date.value,
  ),
);
const monthValue = computed(() =>
  new Intl.DateTimeFormat(language.value.code, { month: 'long' }).format(
    date.value,
  ),
);
</script>

<template>
  <Sticky data-life-period-tracker :top="top" class="z-10">
    <GlassSurface>
      <nav
        class="m-auto flex w-(--width-wide) max-w-full items-center
          justify-center gap-sm px-window sm:gap-lg"
        :aria-label="phrase.life"
      >
        <LifePeriodTrackerItem
          :to="buildLifeUrl(day.date)"
          :label="phrase.life_day_label"
          :value="dayValue"
          value-width="day"
        />
        <LifePeriodTrackerItem
          :to="buildLifeUrl(month)"
          :label="phrase.life_month_label"
          :value="monthValue"
          value-width="month"
        />
        <LifePeriodTrackerItem
          :to="buildLifeUrl(year)"
          :label="phrase.life_year_label"
          :value="year"
          value-width="year"
        />
      </nav>
    </GlassSurface>
  </Sticky>
</template>
