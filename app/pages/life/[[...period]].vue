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
const requestUrl = useRequestURL();
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
});
useHead(() => {
  const pageUrl = new URL(seoCanonical.value, requestUrl.origin).toString();
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  const periods = seoPeriod.value
    ? seoPeriod.value
        .split('-')
        .map((_, index, values) => values.slice(0, index + 1).join('-'))
    : [];
  const items = [
    {
      '@type': 'ListItem',
      position: 1,
      name: phrase.value.life,
      item: new URL('/life/', requestUrl.origin).toString(),
    },
    ...periods.map((period, index) => ({
      '@type': 'ListItem',
      position: index + 2,
      name:
        formatLifeSeoPeriod(period, publicAdmin.value.languageCode) ?? period,
      item: new URL(buildLifeUrl(period), requestUrl.origin).toString(),
    })),
  ];
  return {
    script: [
      {
        key: 'life-page-jsonld',
        type: 'application/ld+json',
        textContent: serializeJsonLd({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebPage',
              '@id': `${pageUrl}#webpage`,
              url: pageUrl,
              name: `${seoTitle.value} — ${publicAdmin.value.displayName}`,
              description: seoDescription.value,
              inLanguage: publicAdmin.value.languageCode,
              isPartOf: {
                '@id': `${new URL('/', requestUrl.origin).toString()}#website`,
              },
              breadcrumb: { '@id': breadcrumbId },
            },
            {
              '@type': 'BreadcrumbList',
              '@id': breadcrumbId,
              itemListElement: items,
            },
          ],
        }),
      },
    ],
  };
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
  <main>
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
      <PublicEmptyState
        v-if="!days.length"
        icon="heart"
        :title="phrase.life_empty"
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
