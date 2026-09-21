<script lang="ts" setup>
import {
  buildLifeUrl,
  lifeActivityDayTotal,
  lifeActivityLevel,
  type LifeActivityKind,
  type LifeActivityResponse,
  type LifeDay,
} from '#layers/thei/shared/life';

/**
 * A year of the timeline as a grid of days: weeks across, weekdays down.
 *
 * The grid answers "what did this year look like" at a glance, which a feed
 * cannot: it shows the quiet months as plainly as the busy ones. Picking a day
 * opens what actually happened, so the summary stays a way into the timeline
 * rather than a decoration.
 */
const selectedYear = ref<number>();
const selectedDate = ref<string>();
const day = ref<LifeDay>();
const dayLoading = ref(false);

const { data } = await useFetch<LifeActivityResponse>('/api/life/activity', {
  key: 'life-activity',
  query: computed(() => ({ year: selectedYear.value })),
});

const weekStartsMonday = computed(() => language.value.code !== 'en');
const locale = computed(() => language.value.code);

/** Columns of seven days, aligned so every column is one calendar week. */
const weeks = computed(() => {
  const value = data.value;
  if (!value) return [];
  const year = value.year;
  const first = new Date(Date.UTC(year, 0, 1));
  const last = new Date(Date.UTC(year, 11, 31));
  const offset = (date: Date) =>
    weekStartsMonday.value ? (date.getUTCDay() + 6) % 7 : date.getUTCDay();
  const columns: {
    key: string;
    month?: number;
    days: ({ date: string; level: number; future: boolean } | undefined)[];
  }[] = [];
  let column: (typeof columns)[number] = { key: 'w0', days: [] };
  for (let index = 0; index < offset(first); index++)
    column.days.push(undefined);
  const today = new Date().toISOString().slice(0, 10);
  for (
    let cursor = new Date(first);
    cursor <= last;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    if (column.days.length === 7) {
      columns.push(column);
      column = { key: `w${columns.length}`, days: [] };
    }
    if (column.days.length === 0 || column.month === undefined)
      column.month = cursor.getUTCMonth();
    column.days.push({
      date,
      level: lifeActivityLevel(
        lifeActivityDayTotal(value.days[date]),
        value.max,
      ),
      future: date > today,
    });
  }
  while (column.days.length < 7) column.days.push(undefined);
  columns.push(column);
  return columns;
});

/** A month label sits above the first week that belongs to it. */
const monthLabels = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, { month: 'short' });
  let previous = -1;
  return weeks.value.map((week) => {
    const month = week.days.find((item) => item)?.date.slice(5, 7);
    const index = month ? Number(month) - 1 : previous;
    if (index === previous) return '';
    previous = index;
    return formatter.format(new Date(Date.UTC(2000, index, 1)));
  });
});

const weekdayLabels = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, { weekday: 'short' });
  // 2024-01-01 was a Monday, so the offsets below name real weekdays.
  const base = weekStartsMonday.value ? 1 : 0;
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, base + index))),
  );
});

/** Counted, not just named: "1 событие" and "5 событий" differ in Russian. */
const kindLabels: Record<LifeActivityKind, (count: number) => string> = {
  event: (count) => phrase.value.life_activity_events(count),
  project: (count) => phrase.value.life_activity_projects(count),
  page: (count) => phrase.value.life_activity_pages(count),
  'project-stage': (count) => phrase.value.life_activity_stages(count),
  'project-section': (count) => phrase.value.life_activity_sections(count),
  'profile-avatar': (count) => phrase.value.life_activity_profile(count),
  'profile-status': (count) => phrase.value.life_activity_statuses(count),
  secret: (count) => phrase.value.life_activity_secret(count),
};

const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
);

function formatDate(date: string) {
  return dateFormatter.value.format(new Date(`${date}T00:00:00Z`));
}

function popup(date: string) {
  const counts = data.value?.days[date];
  const total = lifeActivityDayTotal(counts);
  if (!total)
    return `${formatDate(date)} — ${phrase.value.life_activity_empty}`;
  const parts = Object.entries(counts ?? {}).map(
    ([kind, count]) =>
      kindLabels[kind as LifeActivityKind]?.(count) ?? `${count} ${kind}`,
  );
  // One line: the popup renders its text as it comes, without line breaks.
  return `${formatDate(date)}: ${parts.join(', ')}`;
}

async function selectDay(date: string) {
  if (selectedDate.value === date) {
    selectedDate.value = undefined;
    day.value = undefined;
    return;
  }
  selectedDate.value = date;
  day.value = undefined;
  if (!lifeActivityDayTotal(data.value?.days[date])) return;
  dayLoading.value = true;
  try {
    day.value = await $fetch<LifeDay>('/api/life/day', { query: { date } });
  } catch {
    day.value = undefined;
  } finally {
    dayLoading.value = false;
  }
}

watch(
  () => data.value?.year,
  () => {
    selectedDate.value = undefined;
    day.value = undefined;
  },
);

const levelClasses = [
  'bg-bg-3',
  'bg-accent/25',
  'bg-accent/50',
  'bg-accent/75',
  'bg-accent',
];
const grid = useTemplateRef<HTMLElement>('grid');
onMounted(() => {
  // Narrow screens scroll: the recent weeks are the interesting end.
  if (grid.value) grid.value.scrollLeft = grid.value.scrollWidth;
});
</script>

<template>
  <Box v-if="data && data.years.length" class="overflow-hidden">
    <div class="flex flex-col gap-md p-sm sm:flex-row sm:p-md">
      <div class="flex min-w-0 flex-1 flex-col gap-sm">
        <div class="flex min-w-0 gap-1">
          <!-- Outside the scroller, so the weekdays stay readable while the
               months scroll on a narrow screen. -->
          <div class="mt-4 flex shrink-0 flex-col gap-1 pr-1">
            <span
              v-for="(label, index) in weekdayLabels"
              :key="label"
              class="h-3 text-[0.625rem] leading-3 text-text-3"
              :class="index % 2 === 0 && index !== 6 ? undefined : 'invisible'"
              >{{ label }}</span
            >
          </div>
          <div ref="grid" class="scrollbar-mini min-w-0 overflow-x-auto pb-1">
            <div class="flex w-max gap-1">
              <div
                v-for="(week, weekIndex) in weeks"
                :key="week.key"
                class="flex shrink-0 flex-col gap-1"
              >
                <span class="h-4 text-[0.625rem] leading-4 text-text-3">
                  {{ monthLabels[weekIndex] }}
                </span>
                <template v-for="(item, dayIndex) in week.days">
                  <span
                    v-if="!item"
                    :key="`empty-${dayIndex}`"
                    class="size-3"
                    aria-hidden="true"
                  />
                  <button
                    v-else
                    :key="item.date"
                    type="button"
                    class="size-3 cursor-pointer rounded-xs transition-transform
                      hocus:scale-125 hocus:ring-1 hocus:ring-accent"
                    :class="[
                      levelClasses[item.level],
                      item.future ? 'opacity-40' : undefined,
                      selectedDate === item.date
                        ? 'ring-1 ring-text-1'
                        : undefined,
                    ]"
                    :data-title-popup="popup(item.date)"
                    :aria-label="popup(item.date)"
                    @click="selectDay(item.date)"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-xs text-xs text-text-3">
          <span>{{ phrase.life_activity_less }}</span>
          <span
            v-for="(className, index) in levelClasses"
            :key="index"
            class="size-3 rounded-xs"
            :class="className"
          />
          <span>{{ phrase.life_activity_more }}</span>
        </div>
      </div>
      <div
        class="flex scrollbar-mini gap-xs max-sm:overflow-x-auto sm:w-16
          sm:shrink-0 sm:flex-col"
      >
        <button
          v-for="year in data.years"
          :key="year"
          type="button"
          class="cursor-pointer rounded-normal px-xs py-0.5 text-sm
            transition-colors"
          :class="
            year === data.year
              ? 'bg-accent/20 font-semibold text-accent'
              : 'text-text-2 hocus:bg-bg-3'
          "
          @click="selectedYear = year"
        >
          {{ year }}
        </button>
      </div>
    </div>

    <div
      v-if="selectedDate"
      class="flex flex-col gap-sm border-t border-border-1 p-sm sm:p-md"
    >
      <div class="flex items-center justify-between gap-sm">
        <TheiLink
          :to="buildLifeUrl(selectedDate)"
          class="font-semibold underline-offset-2 hocus:underline"
        >
          {{ formatDate(selectedDate) }}
        </TheiLink>
        <Button
          variant="secondary"
          size="icon-sm"
          :aria-label="phrase.life_activity_close"
          @click="selectDay(selectedDate)"
        >
          <Icon name="close" />
        </Button>
      </div>
      <p v-if="dayLoading" class="text-sm text-text-3">
        <Icon name="loading" class="mr-xs" />{{ phrase.life_activity_loading }}
      </p>
      <div v-else-if="day?.points.length" class="grid gap-sm sm:grid-cols-2">
        <LifePointCard
          v-for="point in day.points"
          :key="point.key"
          :point="point"
          compact
          date-style="short"
        />
      </div>
      <p v-else class="text-sm text-text-3 italic">
        {{ phrase.life_activity_empty }}
      </p>
    </div>

    <div
      v-if="data.projects.length"
      class="flex flex-wrap items-center gap-sm border-t border-border-1 p-sm
        sm:p-md"
    >
      <span class="text-sm text-text-3">
        {{ phrase.life_activity_year_projects }}
      </span>
      <PublicProjectLinks :projects="data.projects" />
    </div>
  </Box>
</template>
