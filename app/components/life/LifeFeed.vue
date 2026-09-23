<script lang="ts" setup>
import {
  buildLifeUrl,
  serializeLifeFilter,
  type LifeFilter,
  type LifeRailTone,
  type LifeScopeRef,
  type LifeWindowResponse,
} from '#layers/thei/shared/life';
import type { LifeFeedRow } from '#layers/thei/app/composables/life-window-cache';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { IconName } from '#thei/icons';

/**
 * The chronology, wherever it is read.
 *
 * The Life page and a project's own tab are the same feed with a different
 * reach, so the virtualiser, the sticky bar and the rail live here once and
 * the pages above only supply the scope and the SEO.
 */
const { initial, scope, basePath, initialDate, trackLastVisit } = defineProps<{
  initial: LifeWindowResponse;
  scope: LifeScopeRef;
  /** Where this feed lives, e.g. `/life/` or a project's timeline tab. */
  basePath: string;
  scopeIcon: IconName;
  /** The scope's own picture, such as a project's icon, shown over the glyph. */
  scopeMedia?: MediaDescriptor;
  scopeLabel: string;
  initialDate?: string;
  /** Only the Life page marks days as new since the last visit. */
  trackLastVisit?: boolean;
}>();

const filter = defineModel<LifeFilter>('filter');
/** The day the reader is on, published upward for SEO and the tab title. */
const activeDateModel = defineModel<string | undefined>('activeDate');

const root = useTemplateRef<HTMLElement>('root');
const scopeQuery = () => {
  const query: Record<string, string> = {};
  if (scope.kind === 'project') query.project = scope.publicId;
  const serialized = serializeLifeFilter(filter.value);
  if (serialized) query.f = serialized;
  return query;
};

const {
  days,
  activeDate,
  activeDay,
  newestDate,
  positioned,
  mounted,
  visibleRows,
  totalSize,
  scrollMargin,
  cachedWindowCount,
  windowCount,
  errors,
  newerCursor,
  olderCursor,
  measure,
  load,
  reloadWindow,
  reset,
  cancel,
} = useLifeFeed(initial, initialDate, root, scopeQuery);

const anchor = useLifeAnchor({
  basePath: () => basePath,
  filter: () => filter.value,
  setActiveDate: (date) => {
    activeDate.value = date;
  },
});

const lifeLastVisit = useLifeLastVisit({ activeDate, newestDate });
function dayTone(date: string): LifeRailTone {
  if (!trackLastVisit) return 'accent';
  return lifeLastVisit.isNewDate(date) ? 'warning' : 'accent';
}
function gapTone(row: LifeFeedRow): LifeRailTone {
  if (row.kind !== 'gap' || !trackLastVisit) return 'accent';
  if (lifeLastVisit.isNewDate(row.date)) return 'warning';
  return lifeLastVisit.isNewDate(row.newerDate)
    ? 'warning-to-accent'
    : 'accent';
}

/**
 * The day under the reader's pointer or focus. A day is several rows of the
 * feed, so each row reports it here and all of them light up together.
 */
const hoveredDate = ref<string>();
function hoverDay(date: string, hovered: boolean) {
  if (hovered) hoveredDate.value = date;
  else if (hoveredDate.value === date) hoveredDate.value = undefined;
}

/**
 * Where each rendered day lies in the feed, for its glow. Only rows that
 * follow each other count as one run, so a row kept rendered far away because
 * it holds focus does not stretch a day over everything in between.
 */
const dayRuns = computed(() => {
  const runs: {
    key: string;
    date: string;
    top: number;
    bottom: number;
    first: boolean;
    last: boolean;
    index: number;
  }[] = [];
  for (const { row, item } of visibleRows.value) {
    if (row.kind !== 'point') continue;
    const top = item.start - scrollMargin.value;
    const bottom = top + item.size;
    const run = runs.at(-1);
    if (run && run.date === row.date && run.index === item.index - 1) {
      run.bottom = bottom;
      run.last = row.last;
      run.index = item.index;
      continue;
    }
    // Keyed by the day, so the glow is not remounted — and does not fade in
    // again — when another of its rows scrolls into view.
    const repeated = runs.some((other) => other.date === row.date);
    runs.push({
      key: repeated ? `${row.date}:${item.index}` : row.date,
      date: row.date,
      top,
      bottom,
      first: row.first,
      last: row.last,
      index: item.index,
    });
  }
  return runs;
});

/** The first day of a year gets the year drawn above its date. */
const yearOpeners = computed(() => {
  const openers = new Set<string>();
  const seen = new Set<string>();
  // Read top to bottom the feed runs newest first, so a year opens on the
  // newest day it holds — the first one the reader meets.
  for (const day of days.value) {
    const year = day.date.slice(0, 4);
    if (seen.has(year)) continue;
    seen.add(year);
    openers.add(day.date);
  }
  return openers;
});

watch([activeDate, mounted, positioned], ([date]) => {
  if (!mounted.value || !positioned.value) return;
  activeDateModel.value = date;
  const path = buildLifeUrl({ date, filter: filter.value }, basePath);
  const href = sitePath(path);
  if (window.location.pathname + window.location.search !== href)
    window.history.replaceState(
      { ...(window.history.state ?? {}), current: path },
      '',
      href,
    );
  if (trackLastVisit) lifeLastVisit.considerActiveDay();
});

/** Whether the reader is inside the feed, which is when the bar is stuck. */
const barStuck = ref(false);

// A changed filter is a different feed: the cached windows describe the old
// one, so the whole thing is refetched. Inside the feed it reopens on the day
// the reader was on. Above it — the filter was changed from the page's own
// header — it starts from the newest day and the page does not move.
watch(filter, async () => {
  cancel();
  const inside = barStuck.value;
  const result = await $fetch<LifeWindowResponse>('/api/life', {
    query: { ...scopeQuery(), ...(inside ? { d: activeDate.value } : {}) },
  });
  await reset(result, inside ? result.anchorDate : undefined, inside);
});

defineExpose({ reset, cancel, activeDate });
</script>

<template>
  <div>
    <LifeStickyBar
      v-if="activeDay"
      v-model:filter="filter"
      :day="activeDay.date"
      :scope="scope"
      :available="initial.kinds"
      :scope-icon="scopeIcon"
      :scope-media="scopeMedia"
      :scope-label="scopeLabel"
      :href="anchor.hrefFor(activeDay.date)"
      @pick="anchor.pick(activeDay.date)"
      @stuck="barStuck = $event"
    />
    <div
      class="m-auto w-(--width-wide) max-w-full pt-lg pr-window pb-xl pl-xs
        sm:px-window"
    >
      <!-- Worded for any feed, not just Life's: a narrowed one points back to
           everything, which is the only way out of an empty filter. -->
      <PublicEmptyState
        v-if="!days.length && filter?.length"
        :title="phrase.feed_empty_filtered"
        :description="phrase.feed_empty_filtered_description"
        class="ml-window sm:ml-0"
      >
        <Button variant="secondary" @click="filter = undefined">
          {{ phrase.life_filter_all }}
        </Button>
      </PublicEmptyState>
      <PublicEmptyState
        v-else-if="!days.length"
        :title="phrase.feed_empty"
        :description="phrase.feed_empty_description"
        class="ml-window sm:ml-0"
      />
      <div v-if="days.length" class="relative">
        <div v-if="!positioned" class="absolute inset-x-0 top-0 z-1">
          <LifeLoader :tone="dayTone(newestDate)" />
        </div>
        <div
          :class="{ invisible: !positioned }"
          :data-life-cached-windows="cachedWindowCount"
          :data-life-windows="windowCount"
        >
          <div v-if="newerCursor">
            <Button v-if="errors.newer" @click="load('newer')">{{
              phrase.asset_upload_retry
            }}</Button>
            <LifeLoader v-else :tone="dayTone(newestDate)" />
          </div>
          <LifeLineStart v-else :tone="dayTone(days[0]?.date ?? '')" />
          <div
            ref="root"
            class="relative"
            :style="
              mounted
                ? { height: totalSize + 'px', overflowAnchor: 'none' }
                : undefined
            "
          >
            <template v-if="mounted">
              <LifeDayGlow
                v-for="run in dayRuns"
                :key="run.key"
                class="absolute left-0"
                :style="{
                  top: run.top + 'px',
                  height: run.bottom - run.top + 'px',
                }"
                :warning="dayTone(run.date) === 'warning'"
                :active="run.date === activeDate"
                :highlighted="run.date === hoveredDate"
                :fade-top="run.first"
                :fade-bottom="run.last"
              />
            </template>
            <div
              v-for="{ row, item } in visibleRows"
              :key="row.key"
              :ref="(element) => measure(element as Element | null)"
              :data-index="item.index"
              :data-life-key="row.key"
              :data-life-day="row.date"
              :style="
                mounted
                  ? {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform:
                        'translateY(' + (item.start - scrollMargin) + 'px)',
                    }
                  : undefined
              "
            >
              <LifeGap
                v-if="row.kind === 'gap'"
                :duration="row.duration"
                :tone="gapTone(row)"
              />
              <LifeTimelineItem
                v-else-if="row.kind === 'point'"
                :point="row.point"
                :tone="dayTone(row.date)"
                :active="row.date === activeDate"
                :highlighted="row.date === hoveredDate"
                :first="row.first"
                :show-year="row.first && yearOpeners.has(row.date)"
                :date-href="anchor.hrefFor(row.date)"
                @pick="anchor.pick(row.date)"
                @hover="hoverDay(row.date, $event)"
              />
              <div
                v-else
                :style="{ height: row.height + 'px' }"
                class="relative"
              >
                <div class="sticky top-1/2">
                  <Button
                    v-if="errors[row.windowId]"
                    @click="reloadWindow(row.windowId)"
                    >{{ phrase.asset_upload_retry }}</Button
                  >
                  <LifeLoader v-else :tone="dayTone(row.date)" />
                </div>
              </div>
            </div>
          </div>
          <div v-if="olderCursor">
            <Button v-if="errors.older" @click="load('older')">{{
              phrase.asset_upload_retry
            }}</Button>
            <LifeLoader v-else :tone="dayTone(days.at(-1)?.date ?? '')" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
