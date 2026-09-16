<script lang="ts" setup>
import {
  buildLifeUrl,
  isLifePeriod,
  lifePeriodFromParts,
  type LifeRailTone,
  type LifeWindowResponse,
} from '#layers/thei/shared/life';
import type { LifeFeedRow } from '#layers/thei/app/composables/life-window-cache';

definePageMeta({ layout: 'public', scrollToTop: false });

const route = useRoute();
const root = useTemplateRef<HTMLElement>('root');
const period = computed(() => {
  const parts = route.params.period;
  const value = lifePeriodFromParts(
    (Array.isArray(parts) ? parts : parts ? [parts] : [])
      .flatMap((part) => String(part).split('/'))
      .filter(Boolean),
  );
  if (value && !isLifePeriod(value))
    throw createResourceError({
      statusCode: 404,
      statusText: 'Period not found',
    });
  return value;
});
const resource = await useFetch<LifeWindowResponse>(
  () =>
    '/api/life' +
    (period.value ? '?period=' + encodeURIComponent(period.value) : ''),
);
if (resource.error.value) throw createResourceError(resource.error.value);
if (!resource.data.value) throw createResourceError({ statusCode: 502 });
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
} = useLifeFeed(resource.data.value, period.value, root);
const publicAdmin = await usePublicAdmin();
const seoPeriod = ref(period.value);
const seoPeriodLabel = computed(() =>
  formatLifeSeoPeriod(seoPeriod.value, publicAdmin.value.languageCode),
);
const seoTitle = computed(() =>
  seoPeriodLabel.value
    ? `${seoPeriodLabel.value} · ${phrase.value.life}`
    : phrase.value.life,
);
const seoDescription = computed(() =>
  seoPeriodLabel.value
    ? phrase.value.public_life_period_description(
        seoPeriodLabel.value,
        publicAdmin.value.displayName,
      )
    : phrase.value.public_life_description,
);
const seoCanonical = computed(() => buildLifeUrl(seoPeriod.value));

usePublicSeo({
  title: seoTitle,
  description: seoDescription,
  canonical: seoCanonical,
  pageType: 'CollectionPage',
  // The tab title reads "6 April 2027 · Life"; a trail ending in the period
  // alone reads better and does not repeat the crumb above it.
  breadcrumbName: () => seoPeriodLabel.value,
  breadcrumbs: () => {
    if (!seoPeriod.value) return [];
    const parts = seoPeriod.value.split('-');
    return [
      { name: phrase.value.life, path: '/life/' },
      // Every period above this one; the page itself is appended by the
      // composable, so the deepest is left out here.
      ...parts.slice(0, -1).map((_, index) => {
        const period = parts.slice(0, index + 1).join('-');
        return {
          name: formatLifeSeoPeriod(period, language.value.code) ?? period,
          path: buildLifeUrl(period),
        };
      }),
    ];
  },
});
const lifeLastVisit = useLifeLastVisit({ activeDate, newestDate });
watch([activeDate, mounted, positioned], ([date]) => {
  if (!mounted.value || !positioned.value) return;
  seoPeriod.value = date;
  const path = buildLifeUrl(date);
  if (window.location.pathname !== path)
    window.history.replaceState(
      { ...(window.history.state ?? {}), current: path },
      '',
      path,
    );
  lifeLastVisit.considerActiveDay();
});
watch(period, () => {
  cancel();
  seoPeriod.value = period.value;
});
watch(resource.data, async (result) => {
  if (!result || !mounted.value) return;
  const loadedPeriod = period.value;
  await reset(result, loadedPeriod);
  if (resource.data.value === result && period.value === loadedPeriod)
    resource.clear();
});
watch(resource.error, (error) => {
  if (error) showError(createResourceError(error));
});
// The feed owns its bounded payload cache after hydration.
onMounted(() => resource.clear());
function dayTone(date: string): LifeRailTone {
  return lifeLastVisit.isNewDate(date) ? 'warning' : 'accent';
}
function gapTone(row: LifeFeedRow): LifeRailTone {
  if (row.kind !== 'gap') return 'accent';
  if (lifeLastVisit.isNewDate(row.date)) return 'warning';
  return lifeLastVisit.isNewDate(row.newerDate)
    ? 'warning-to-accent'
    : 'accent';
}
</script>

<template>
  <main :data-life-period="period || ''" :data-life-newest-date="newestDate">
    <div class="m-auto w-(--width-wide) max-w-full px-window pt-lg pb-md">
      <PublicPageHeader
        icon="heart"
        :title="phrase.life"
        :description="phrase.public_life_description"
      />
    </div>
    <LifePeriodTracker v-if="activeDay" :day="activeDay" />
    <div
      class="m-auto w-(--width-wide) max-w-full pt-lg pr-window pb-xl pl-0
        sm:px-window"
    >
      <EmptyState
        v-if="!days.length"
        icon="heart"
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
                :active-start="row.first"
                :active-end="row.last"
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
  </main>
</template>
