<script lang="ts" setup>
import type { LifeRewindResponse } from '#layers/thei/shared/life-rewind';

definePageMeta({ layout: 'public' });
const route = useRoute();
const page = computed(() => String(route.query.page ?? '1'));
const resource = await useFetch<LifeRewindResponse>('/api/life/rewind', {
  query: { page },
});
const rewind = useRequiredResource(resource);
const title = computed(() =>
  phrase.value.life_rewind(
    formatPublicMonthDay(rewind.value.referenceDate, language.value.code),
  ),
);
const ogImage = useOgImage(
  'service',
  () => 'rewind',
  () => ['rewind'],
);
usePublicSeo({
  ogImage,
  title: computed(() => phrase.value.life_rewind_seo_title),
  description: computed(() => phrase.value.life_rewind_description),
  canonical: computed(() =>
    buildPublicCanonical('/rewind/', { page: rewind.value.page }),
  ),
  pageType: 'CollectionPage',
  breadcrumbs: () => [{ name: phrase.value.life, path: '/life/' }],
  entities: () => [
    {
      '@type': 'ItemList',
      '@id': '#list',
      numberOfItems: rewind.value.total,
      // Secret points carry no title or href on purpose; they are records that
      // something happened, and listing them would be the leak they prevent.
      itemListElement: rewind.value.items.flatMap(({ point }, index) =>
        point.visibility === 'visible'
          ? [
              {
                '@type': 'ListItem',
                position:
                  (rewind.value.page - 1) * rewind.value.pageSize + index + 1,
                url: point.href,
                name: point.title,
              },
            ]
          : [],
      ),
    },
  ],
});
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="history"
      :title="title"
      :description="phrase.life_rewind_description"
    />
    <div v-if="rewind.items.length" class="grid gap-md sm:grid-cols-2">
      <LifePointCard
        v-for="item in rewind.items"
        :key="item.point.key"
        :point="item.point"
        :rewind-match="item.match"
        date-style="long"
      />
    </div>
    <PublicEmptyState
      v-else
      :title="phrase.life_rewind_empty"
      :description="phrase.life_rewind_empty_description"
    >
      <TheiLink
        to="/life/"
        class="inline-flex items-center gap-xs font-semibold text-accent
          transition hocus:underline"
      >
        <Icon name="heart" />
        {{ phrase.life_rewind_explore_life }}
        <Icon name="arrow-outward" />
      </TheiLink>
    </PublicEmptyState>
    <Pagination
      :page="rewind.page"
      :page-count="rewind.pageCount"
      :pending="resource.status.value === 'pending'"
    />
  </main>
</template>
