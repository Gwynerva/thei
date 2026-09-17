<script lang="ts" setup>
import type { PublicProjectEventsResponse } from '#layers/thei/shared/api/public';
import { buildProjectUrl } from '#layers/thei/shared/project-url';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const page = computed(() => String(route.query.page ?? '1'));
const resource = await useFetch<PublicProjectEventsResponse>(
  () =>
    `/api/projects/${encodeURIComponent(String(route.params.projectUuid))}/events`,
  { query: { page } },
);
const data = useRequiredResource(resource);
const baseCanonical = computed(
  () =>
    `${buildProjectUrl(data.value.project.humanReadableSlug, data.value.project.publicId)}events/`,
);
if (route.path !== baseCanonical.value)
  await navigateTo(
    { path: baseCanonical.value, query: route.query },
    { redirectCode: 301 },
  );
const title = computed(() => phrase.value.related_events);
usePublicSeo({
  title: () => `${title.value} — ${data.value.project.title}`,
  description: () =>
    phrase.value.related_events_description(data.value.project.title),
  canonical: computed(() =>
    buildPublicCanonical(baseCanonical.value, { page: data.value.page }),
  ),
  noIndex: () => data.value.project.access === 'link-only',
  pageType: 'CollectionPage',
  breadcrumbs: () => [
    { name: phrase.value.search, path: '/search/' },
    { name: data.value.project.title, path: data.value.project.href },
  ],
  image: () => data.value.project.iconMedia.src,
  entities: () => [
    {
      '@type': 'ItemList',
      '@id': '#list',
      numberOfItems: data.value.total,
      itemListElement: data.value.items.map((item, index) => ({
        '@type': 'ListItem',
        position: (data.value.page - 1) * data.value.pageSize + index + 1,
        url: item.href,
        name: item.title,
      })),
    },
  ],
});
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="event"
      :title="title"
      :description="phrase.related_events_description(data.project.title)"
      :back-link="data.project"
    />
    <div v-if="data.items.length" class="grid gap-sm sm:grid-cols-2">
      <PublicEntityCard
        v-for="item in data.items"
        :key="item.href"
        :entity="item"
        :class="{
          'first:sm:col-span-2': publicCardGridFirstItemIsWide(
            data.items.length,
          ),
        }"
      />
    </div>
    <PublicEmptyState v-else :title="phrase.related_events_empty" />
    <PublicPagination :page="data.page" :page-count="data.pageCount" />
  </main>
</template>
