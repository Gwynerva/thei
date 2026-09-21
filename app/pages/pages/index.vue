<script lang="ts" setup>
import type { PublicPageListItem } from '#layers/thei/shared/api/page';

definePageMeta({ layout: 'public' });
const resource = await useFetch<PublicPageListItem[]>('/api/pages');
const pages = useRequiredResource(resource);
const ogImage = useOgImage(
  'service',
  () => 'pages',
  () => ['pages'],
);
usePublicSeo({
  ogImage,
  title: computed(() => phrase.value.pages),
  description: computed(() => phrase.value.public_pages_description),
  canonical: '/pages/',
  pageType: 'CollectionPage',
  entities: () => [
    {
      '@type': 'ItemList',
      '@id': '#list',
      numberOfItems: pages.value.length,
      // This listing is not paginated, so the list can be arbitrarily long.
      // `numberOfItems` still reports the whole set; the elements are a
      // sample, which is all a crawler needs and keeps the markup bounded.
      itemListElement: pages.value.slice(0, 100).map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
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
      icon="page"
      :title="phrase.pages"
      :description="phrase.public_pages_description"
    />
    <div v-if="pages.length" class="grid gap-sm sm:grid-cols-2">
      <PublicContentCard
        v-for="page in pages"
        :key="page.href"
        :href="page.href"
        :title="page.title"
        :summary="page.summary"
        :label="phrase.page"
        icon="page"
        :date="page.updatedAt"
        :media="page.iconMedia"
      />
    </div>
    <PublicEmptyState
      v-else
      :title="phrase.no_pages"
      :description="phrase.public_pages_empty_description"
    />
  </main>
</template>
