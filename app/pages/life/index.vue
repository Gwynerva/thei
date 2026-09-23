<script lang="ts" setup>
import {
  buildLifeUrl,
  isLifeDay,
  LIFE_SCOPE_LIFE,
  parseLifeFilter,
  serializeLifeFilter,
  type LifeFilter,
  type LifeWindowResponse,
} from '#layers/thei/shared/life';
import { lifePreset, lifePresetHref } from '#layers/thei/shared/life-presets';

definePageMeta({ layout: 'public', scrollToTop: false });

const route = useRoute();
const router = useRouter();
const requestedDate = computed(() => {
  const value = route.query.d;
  if (typeof value !== 'string' || !value) return undefined;
  if (!isLifeDay(value))
    throw createResourceError({ statusCode: 404, statusText: 'Day not found' });
  return value;
});
const filter = ref<LifeFilter>(parseLifeFilter(route.query.f));

const resource = await useFetch<LifeWindowResponse>(() => {
  const query = new URLSearchParams();
  if (requestedDate.value) query.set('d', requestedDate.value);
  const serialized = serializeLifeFilter(filter.value);
  if (serialized) query.set('f', serialized);
  const search = query.toString();
  return '/api/life' + (search ? `?${search}` : '');
});
if (resource.error.value) throw createResourceError(resource.error.value);
if (!resource.data.value) throw createResourceError({ statusCode: 502 });

const publicAdmin = await usePublicAdmin();
const activeDate = ref(requestedDate.value ?? resource.data.value.anchorDate);
const seoLabel = computed(() =>
  formatLifeSeoDate(activeDate.value, publicAdmin.value.languageCode),
);
/**
 * A few filters are destinations rather than ways of reading: the diary is
 * one. Those get their own name, description and canonical address; every
 * other filter still points back at the whole feed.
 */
const preset = computed(() => lifePreset(filter.value));
const presetTitle = computed(() =>
  preset.value ? phrase.value.diary_seo_title : undefined,
);
const seoTitle = computed(() => {
  const base = presetTitle.value ?? phrase.value.life;
  return seoLabel.value ? `${seoLabel.value} · ${base}` : base;
});
const seoDescription = computed(() => {
  if (preset.value && !seoLabel.value)
    return phrase.value.diary_seo_description;
  return seoLabel.value
    ? phrase.value.public_life_period_description(
        seoLabel.value,
        publicAdmin.value.displayName,
      )
    : phrase.value.public_life_description;
});

const ogImage = useOgImage(
  'service',
  () => 'life',
  () => ['life'],
);
usePublicSeo({
  ogImage,
  title: seoTitle,
  description: seoDescription,
  // The canonical is the unfiltered feed, or the preset when the filter is
  // one. Every other combination pointing at itself would fill an index with
  // near-duplicates of the same timeline.
  canonical: () =>
    preset.value ? lifePresetHref(preset.value) : buildLifeUrl(),
  pageType: 'CollectionPage',
  breadcrumbName: () => seoLabel.value,
});

// The filter belongs in the address so it can be shared. The day is written by
// the feed itself as the reader scrolls.
watch(filter, (value) => {
  const query = { ...route.query };
  const serialized = serializeLifeFilter(value);
  if (serialized) query.f = serialized;
  else delete query.f;
  void router.replace({ path: route.path, query });
});
</script>

<template>
  <main
    :data-life-active-date="activeDate"
    :data-life-newest-date="resource.data.value?.newestDate"
  >
    <div class="m-auto w-(--width-wide) max-w-full px-window pt-lg pb-md">
      <PublicPageHeader
        :icon="preset?.icon ?? 'heart'"
        :title="presetTitle ?? phrase.life"
        :description="
          preset ? phrase.diary_seo_description : phrase.public_life_description
        "
      />
    </div>
    <LifeFeed
      v-if="resource.data.value"
      v-model:filter="filter"
      v-model:active-date="activeDate"
      :initial="resource.data.value"
      :scope="LIFE_SCOPE_LIFE"
      base-path="/life/"
      :scope-icon="preset?.icon ?? 'heart'"
      :scope-label="presetTitle ?? phrase.life"
      :initial-date="requestedDate"
      track-last-visit
    />
  </main>
</template>
