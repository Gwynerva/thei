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

// A changed filter is a different feed: the cached windows describe the old
// one, so the whole thing is refetched from the day the reader was on.
watch(filter, async () => {
  cancel();
  const result = await $fetch<LifeWindowResponse>('/api/life', {
    query: { ...scopeQuery(), d: activeDate.value },
  });
  await reset(result, result.anchorDate);
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
      :scope-icon="scopeIcon"
      :scope-label="scopeLabel"
      :href="anchor.hrefFor(activeDay.date)"
      @pick="anchor.pick(activeDay.date)"
    />
    <div
      class="m-auto w-(--width-wide) max-w-full pt-lg pr-window pb-xl pl-0
        sm:px-window"
    >
      <PublicEmptyState
        v-if="!days.length"
        :title="phrase.life_empty"
        :description="phrase.life_empty_description"
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
                :first="row.first"
                :last="row.last"
                :show-year="row.first && yearOpeners.has(row.date)"
                :date-href="anchor.hrefFor(row.date)"
                @pick="anchor.pick(row.date)"
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
