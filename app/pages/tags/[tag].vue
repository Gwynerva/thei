<script lang="ts" setup>
import type { PublicTagResponse } from '#layers/thei/shared/api/public';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import TheiLink from '#layers/thei/app/components/TheiLink';

definePageMeta({ layout: 'public', key: (route) => String(route.params.tag) });
const route = useRoute();
const requestedTab = computed(() =>
  route.query.tab === 'events' ? 'events' : 'projects',
);
const page = computed(() => String(route.query.page ?? '1'));
const resource = await useFetch<PublicTagResponse>(
  () => `/api/tags/${encodeURIComponent(String(route.params.tag))}`,
  { query: { tab: requestedTab, page } },
);
const tag = useRequiredResource(resource);
const baseCanonical = computed(() =>
  buildTagUrl(tag.value.slug, tag.value.publicId),
);
if (route.path !== baseCanonical.value)
  await navigateTo(
    { path: baseCanonical.value, query: route.query },
    { redirectCode: 301 },
  );
const canonical = computed(() =>
  buildPublicCanonical(baseCanonical.value, {
    tab: tag.value.activeTab,
    page: tag.value.items.page,
  }),
);
usePublicSeo({
  title: computed(() => tag.value.title),
  description: computed(
    () => tag.value.description ?? phrase.value.public_tags_description,
  ),
  canonical,
  pageType: 'CollectionPage',
  breadcrumbs: () => [{ name: phrase.value.tags, path: '/tags/' }],
  image: () => tag.value.iconMedia?.src,
  entities: () => [
    {
      '@type': 'ItemList',
      '@id': '#list',
      numberOfItems: tag.value.items.total,
      itemListElement: tag.value.items.items.map((item, index) => ({
        '@type': 'ListItem',
        position:
          (tag.value.items.page - 1) * tag.value.items.pageSize + index + 1,
        url: item.href,
        name: item.title,
      })),
    },
  ],
});

const tabs = computed(() => [
  {
    name: 'projects' as const,
    count: tag.value.projectCount,
    label: phrase.value.projects_count(tag.value.projectCount),
  },
  {
    name: 'events' as const,
    count: tag.value.eventCount,
    label: phrase.value.events_count(tag.value.eventCount),
  },
]);

function tabTo(tab: 'projects' | 'events') {
  return {
    path: baseCanonical.value,
    query: tab === 'events' ? { tab: 'events' } : {},
  };
}
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="tag"
      :icon-media="tag.iconMedia"
      :title="tag.title"
      :description="tag.description"
    />

    <div
      role="tablist"
      class="grid grid-cols-2 rounded-normal bg-bg-3 p-1 text-sm font-semibold"
      :aria-label="tag.title"
    >
      <component
        :is="tab.count ? TheiLink : 'span'"
        v-for="tab in tabs"
        :key="tab.name"
        :to="tab.count ? tabTo(tab.name) : undefined"
        role="tab"
        :aria-selected="tag.activeTab === tab.name"
        :aria-disabled="tab.count ? undefined : 'true'"
        aria-controls="tag-entities"
        class="rounded-sm px-xs py-xs text-center transition"
        :class="
          tag.activeTab === tab.name
            ? 'bg-bg-1 text-text-1 shadow-sm'
            : tab.count
              ? 'text-text-2 hocus:text-accent'
              : 'cursor-not-allowed text-text-3'
        "
      >
        {{ tab.label }}
      </component>
    </div>

    <section id="tag-entities" role="tabpanel" class="flex flex-col gap-sm">
      <div class="grid gap-sm sm:grid-cols-2">
        <PublicEntityCard
          v-for="entity in tag.items.items"
          :key="entity.href"
          :entity="entity"
        />
      </div>
      <PublicPagination
        :page="tag.items.page"
        :page-count="tag.items.pageCount"
      />
    </section>
  </main>
</template>
