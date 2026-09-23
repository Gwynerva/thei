<script lang="ts" setup>
import {
  buildLifeUrl,
  LIFE_ACTIVITY_TOTAL_KINDS,
  lifeActivityDayTotal,
  lifeActivityLevel,
  type LifeActivityKind,
  type LifeActivityResponse,
  type LifeDay,
  type LifePoint,
} from '#layers/thei/shared/life';
import { lifeEntityKindIcon } from './life-entity-icon';
import TheiLink from '../TheiLink';

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
    days: ({ date: string; level: number } | undefined)[];
  }[] = [];
  let column: (typeof columns)[number] = { key: 'w0', days: [] };
  for (let index = 0; index < offset(first); index++)
    column.days.push(undefined);
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
    });
  }
  while (column.days.length < 7) column.days.push(undefined);
  columns.push(column);
  return columns;
});

/**
 * Where each month begins and ends, in weeks.
 *
 * A week that straddles two months goes to the one holding most of its days,
 * so a month's label centres over the weeks that are mostly it and the
 * divider falls between two weeks rather than through one.
 */
const months = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, { month: 'short' });
  const starts: number[] = [];
  weeks.value.forEach((week, index) => {
    const row = week.days.findIndex((item) => item?.date.endsWith('-01'));
    if (row < 0) return;
    // January always starts the grid, whatever weekday it falls on.
    starts.push(starts.length === 0 ? 0 : row <= 3 ? index : index + 1);
  });
  return starts.map((start, month) => ({
    key: month,
    label: formatter.format(new Date(Date.UTC(2000, month, 1))),
    start,
    // The middle of the month's weeks, in weeks from the grid's start.
    centre: (start + (starts[month + 1] ?? weeks.value.length)) / 2,
  }));
});

/** Weeks that open a month, which get a little extra room before them. */
const monthStarts = computed(
  () => new Set(months.value.slice(1).map((month) => month.start)),
);

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
  'diary-entry': (count) => phrase.value.life_activity_diary(count),
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

function dayTotal(date: string) {
  return lifeActivityDayTotal(data.value?.days[date]);
}

/** Just how busy the day was; what it held is one click away. */
function popup(date: string) {
  const total = dayTotal(date);
  return `${formatDate(date)} - ${
    total
      ? phrase.value.life_activity_actions(total)
      : phrase.value.life_activity_empty
  }`;
}

/** The year in numbers, every kind always shown so the row never reflows. */
const totals = computed(() =>
  LIFE_ACTIVITY_TOTAL_KINDS.map((kind) => {
    const count = data.value?.totals[kind] ?? 0;
    const label = kindLabels[kind](count);
    return {
      kind,
      count,
      icon: lifeEntityKindIcon(kind),
      label,
      // The number is already written large beside it; the word keeps the
      // form that agrees with it ("5 записей", not "Записи").
      name: label.replace(/^\d+\s*/, ''),
    };
  }),
);

/**
 * The point's own picture — a project's icon, the first image of a body —
 * or nothing. A drawn fallback is only the kind's icon on a coloured field,
 * which the plain icon already says better.
 */
function pointPicture(point: LifePoint) {
  if (point.visibility !== 'visible' || !point.media) return undefined;
  return point.media.generated ? undefined : point.media;
}

/** A diary entry has no title: it is known by the day it was written on. */
function pointTitle(point: LifePoint) {
  return point.visibility === 'visible' && point.entityKind === 'diary-entry'
    ? formatDate(point.date)
    : point.title;
}

async function selectDay(date: string) {
  if (selectedDate.value === date) {
    selectedDate.value = undefined;
    day.value = undefined;
    return;
  }
  selectedDate.value = date;
  day.value = undefined;
  if (!dayTotal(date)) return;
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
    <!--
      The years head the block; everything under them is the chosen year's.
      Many years scroll sideways, with the bar on top.

      One vertical step runs through the whole block: every section keeps
      `sm` above it and the last one `sm` below, whatever the width. Only the
      sides widen on a wide screen.
    -->
    <div class="scrollbar-hover rotate-x-180 overflow-x-auto">
      <div
        class="flex w-max min-w-full rotate-x-180 gap-xs px-sm py-sm sm:px-md"
        role="group"
        :aria-label="phrase.life_activity"
      >
        <button
          v-for="year in data.years"
          :key="year"
          type="button"
          class="cursor-pointer rounded-normal px-xs py-0.5 text-sm tabular-nums
            transition-colors"
          :class="
            year === data.year
              ? 'bg-accent/20 font-semibold text-accent'
              : 'text-text-2 hocus:bg-bg-3'
          "
          :aria-pressed="year === data.year"
          @click="selectedYear = year"
        >
          {{ year }}
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-xs px-sm sm:px-md">
      <span
        v-for="total in totals"
        :key="total.kind"
        tabindex="0"
        role="img"
        :aria-label="total.label"
        :data-title-popup="total.label"
        class="inline-flex items-center gap-1.5 rounded-sm bg-bg-3 px-xs py-1.5
          text-sm focus-visible:ring-2 focus-visible:ring-accent
          focus-visible:outline-none"
        :class="total.count ? 'text-text-1' : 'text-text-3 opacity-60'"
      >
        <Icon
          :name="total.icon"
          class="shrink-0"
          :class="total.count ? 'text-accent' : undefined"
        />
        <span class="leading-none font-bold tabular-nums">{{
          total.count
        }}</span>
        <span class="hidden text-xs text-text-2 sm:inline">{{
          total.name
        }}</span>
      </span>
    </div>

    <!--
      The grid spreads its gaps to fill the width and only scrolls once they
      are down to their minimum. The scrollbar sits on top: the scroller is
      flipped, which puts its bar above, and its content flipped back.
      Weekdays ride along, pinned to the left edge, so the rows keep lining up
      whether or not a scrollbar is showing.
    -->
    <div class="@container p-sm sm:px-md">
      <!-- The dividers run one gap past the last row, as they start one gap
           above the first. The scroller would clip them, so it holds that
           length as padding and gives it back as a negative margin: the
           space under the cells stays the block's own step. -->
      <div
        ref="grid"
        class="heatmap-gaps -mb-(--heatmap-gap) scrollbar-hover rotate-x-180
          overflow-x-auto"
        :style="{
          '--weeks': weeks.length,
          '--month-breaks': monthStarts.size,
        }"
      >
        <div
          class="relative flex w-max min-w-full rotate-x-180 gap-(--heatmap-gap)
            pb-(--heatmap-gap)"
        >
          <!-- Months are drawn over the weeks rather than inside them, so a
               label can centre over its month and a divider can sit in the
               gap between two weeks. -->
          <span
            v-for="month in months"
            :key="`label-${month.key}`"
            class="heatmap-at absolute top-0 h-4 -translate-x-1/2
              text-[0.625rem] leading-4 whitespace-nowrap text-text-3"
            :style="{ '--at': month.centre, '--breaks': month.key }"
            aria-hidden="true"
            >{{ month.label }}</span
          >
          <span
            v-for="month in months.slice(1)"
            :key="`divider-${month.key}`"
            class="heatmap-at heatmap-divider absolute bottom-0 border-l
              border-dashed border-border-2/60"
            :style="{ '--at': month.start, '--breaks': month.key - 0.5 }"
            aria-hidden="true"
          />
          <div
            class="sticky left-0 z-1 flex w-6 shrink-0 flex-col
              gap-(--heatmap-gap) bg-bg-2"
          >
            <span class="h-4" aria-hidden="true" />
            <span
              v-for="(label, index) in weekdayLabels"
              :key="label"
              class="h-3 text-[0.625rem] leading-3 text-text-3"
              :class="index % 2 === 0 && index !== 6 ? undefined : 'invisible'"
              >{{ label }}</span
            >
          </div>
          <div
            v-for="(week, weekIndex) in weeks"
            :key="week.key"
            class="flex shrink-0 flex-col gap-(--heatmap-gap)"
            :class="{ 'ml-(--month-break)': monthStarts.has(weekIndex) }"
          >
            <span class="h-4" aria-hidden="true" />
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
                  // The ring stands off the cell, so a gap of the block's own
                  // colour keeps the cell's shade readable inside it.
                  selectedDate === item.date
                    ? 'ring-1 ring-text-1 ring-offset-1 ring-offset-bg-2'
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

    <div
      v-if="selectedDate"
      class="flex flex-col gap-xs border-t border-border-1 p-sm sm:px-md"
    >
      <!-- The date only names the day; the actions sit right beside it. -->
      <div class="flex items-center gap-xs">
        <span class="mr-xs font-semibold">{{ formatDate(selectedDate) }}</span>
        <TheiLink
          v-if="dayTotal(selectedDate)"
          :to="buildLifeUrl({ date: selectedDate })"
          :aria-label="phrase.open_life"
          :data-title-popup="phrase.open_life"
          class="flex size-8 shrink-0 items-center justify-center rounded-normal
            bg-bg-3 p-1 text-base text-text-2 transition-colors
            focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:outline-none hocus:bg-accent/25 hocus:text-accent"
        >
          <Icon name="arrow-outward" />
        </TheiLink>
        <Button
          variant="secondary"
          size="icon-sm"
          :aria-label="phrase.life_activity_close"
          :data-title-popup="phrase.life_activity_close"
          @click="selectDay(selectedDate)"
        >
          <Icon name="close" />
        </Button>
      </div>
      <p v-if="dayLoading" class="text-sm text-text-3">
        <Icon name="loading" class="mr-xs" />{{ phrase.life_activity_loading }}
      </p>
      <ul
        v-else-if="day?.points.length"
        class="-mx-xs flex scrollbar-hover max-h-96 flex-col overflow-y-auto"
      >
        <li v-for="point in day.points" :key="point.key" class="min-w-0">
          <component
            :is="point.visibility === 'visible' ? TheiLink : 'div'"
            v-bind="point.visibility === 'visible' ? { to: point.href } : {}"
            class="flex min-w-0 items-center gap-sm rounded-sm px-xs py-xs"
            :class="
              point.visibility === 'visible'
                ? 'text-text-1 transition hocus:bg-bg-3'
                : 'text-text-3'
            "
            :data-title-popup="
              point.visibility === 'visible' ? undefined : phrase.secret_hint
            "
          >
            <!-- A picture of its own when the point has one, marked with its
                 kind in the corner as the side panel marks related entities;
                 otherwise the kind's icon alone. -->
            <span
              class="relative flex size-10 shrink-0 items-center justify-center
                overflow-hidden rounded-sm bg-bg-3 text-lg text-text-3"
            >
              <Media
                v-if="pointPicture(point)"
                v-bind="pointPicture(point)!"
                class="size-full"
              />
              <Icon
                v-else
                :name="lifeEntityKindIcon(point.entityKind)"
                :aria-label="phrase.life_filter_kind(point.entityKind)"
                role="img"
              />
              <span
                v-if="pointPicture(point)"
                class="absolute right-0 bottom-0 z-2 flex size-4 items-center
                  justify-center rounded-tl-sm bg-bg-1 text-xs text-accent"
                :aria-label="phrase.life_filter_kind(point.entityKind)"
                role="img"
              >
                <Icon :name="lifeEntityKindIcon(point.entityKind)" />
              </span>
            </span>
            <span class="flex min-w-0 flex-col">
              <span
                class="truncate font-semibold"
                :class="{ italic: point.visibility !== 'visible' }"
                >{{ publicText(pointTitle(point)) }}</span
              >
              <span
                v-if="point.summary"
                class="truncate text-sm text-text-2"
                :class="{ italic: point.entityKind === 'diary-entry' }"
                >{{ publicText(point.summary) }}</span
              >
            </span>
          </component>
        </li>
      </ul>
      <p v-else class="text-sm text-text-3 italic">
        {{ phrase.life_activity_empty }}
      </p>
    </div>
  </Box>
</template>

<style scoped>
/*
 * The gap that makes the weeks fill the grid's width, never below a hair.
 * Rows use it too, so the cells stay evenly spaced both ways. 1.5rem is the
 * weekday column, 0.75rem a cell; each month boundary takes a little extra
 * room so its divider does not brush the cells on either side.
 */
.heatmap-gaps {
  --month-break: 0.375rem;
  --heatmap-gap: max(
    0.25rem,
    (
        100cqw - 1.5rem - var(--weeks) * 0.75rem - var(--month-breaks) *
          var(--month-break)
      ) /
      var(--weeks)
  );
}

/*
 * A point along the weeks: `--at` counts weeks (0 is the gap before the
 * first), `--breaks` how many month boundaries' extra room lies before it.
 */
.heatmap-at {
  left: calc(
    1.5rem + var(--heatmap-gap) / 2 + var(--at) *
      (0.75rem + var(--heatmap-gap)) + var(--breaks) * var(--month-break)
  );
}

/* From under the month labels to the last row. */
.heatmap-divider {
  top: 1rem;
}
</style>
