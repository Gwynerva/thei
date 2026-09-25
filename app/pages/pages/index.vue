<script lang="ts" setup>
import type { PublicPageListItem } from '#layers/thei/shared/api/page';
import type { PublicPaginatedResponse } from '#layers/thei/shared/api/public';

definePageMeta({ layout: 'public' });
const route = useRoute();
const page = computed(() => String(route.query.page ?? '1'));
const resource = await useFetch<PublicPaginatedResponse<PublicPageListItem>>(
  '/api/pages',
  { query: { page } },
);
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
  canonical: computed(() =>
    buildPublicCanonical('/pages/', { page: pages.value.page }),
  ),
  pageType: 'CollectionPage',
  entities: () => [
    {
      '@type': 'ItemList',
      '@id': '#list',
      numberOfItems: pages.value.total,
      itemListElement: pages.value.items.map((item, index) => ({
        '@type': 'ListItem',
        position: (pages.value.page - 1) * pages.value.pageSize + index + 1,
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
    <div v-if="pages.items.length" class="grid gap-md sm:grid-cols-2">
      <PublicContentCard
        v-for="item in pages.items"
        :key="item.href"
        :href="item.href"
        :title="item.title"
        :summary="item.summary"
        :label="phrase.page"
        icon="page"
        :date="item.updatedAt"
        :media="item.iconMedia"
      />
    </div>
    <PublicEmptyState
      v-else
      :title="phrase.no_pages"
      :description="phrase.public_pages_empty_description"
    />
    <PublicPagination :page="pages.page" :page-count="pages.pageCount" />
  </main>
</template>
