<script lang="ts" setup>
import type { PublicTagResponse } from '#layers/thei/shared/api/public';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import TheiLink from '#layers/thei/app/components/TheiLink';
import { tagAccentCssColor } from '#layers/thei/shared/tag';

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
const ogImage = useOgImage(() => ({ kind: 'tag', id: tag.value.publicId }));
usePublicSeo({
  ogImage,
  title: computed(() => tag.value.title),
  description: computed(
    () =>
      tag.value.description ??
      phrase.value.public_tag_description(tag.value.title),
  ),
  canonical,
  pageType: 'CollectionPage',
  breadcrumbs: () => [{ name: phrase.value.tags, path: '/tags/' }],
  image: () => publicSeoImage(tag.value.iconMedia, ogImage.value?.url),
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
    icon: 'project' as const,
    count: tag.value.projectCount,
    label: phrase.value.projects,
  },
  {
    name: 'events' as const,
    icon: 'event' as const,
    count: tag.value.eventCount,
    label: phrase.value.events,
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
      icon-kind="custom"
      :icon-media="tag.iconMedia"
      :accent-color="tagAccentCssColor(tag)"
      :title="tag.title"
      :description="tag.description"
    />

    <!-- Underlined like every row of tabs that switches what a page lists —
         its relations, a project's sections — but links: each tab is an
         address of its own. -->
    <div
      role="tablist"
      class="flex min-w-0 border-b border-border-1 text-sm font-semibold
        max-sm:justify-center"
      :aria-label="publicText(tag.title)"
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
        class="relative flex items-center gap-xs px-xs py-sm no-underline
          transition focus-visible:ring-2 focus-visible:ring-accent
          focus-visible:outline-none focus-visible:ring-inset sm:px-sm"
        :class="
          tag.activeTab === tab.name
            ? 'text-accent'
            : tab.count
              ? 'text-text-2 hocus:bg-bg-3/60 hocus:text-accent'
              : 'cursor-not-allowed text-text-3'
        "
      >
        <Icon :name="tab.icon" class="shrink-0" aria-hidden="true" />
        {{ tab.label }}
        <span
          v-if="tab.count"
          class="shrink-0 rounded-full bg-bg-3 px-2 py-0.5 text-xs leading-none
            tabular-nums"
        >
          {{ tab.count }}
        </span>
        <span
          v-if="tag.activeTab === tab.name"
          class="absolute inset-x-xs -bottom-0.5 h-1 rounded-full bg-accent
            shadow-md shadow-accent/50 sm:inset-x-sm"
          aria-hidden="true"
        />
      </component>
    </div>

    <section id="tag-entities" role="tabpanel" class="flex flex-col gap-sm">
      <div class="grid grid-cols-cards gap-md">
        <PublicEntityCard
          v-for="entity in tag.items.items"
          :key="entity.href"
          :entity="entity"
        />
      </div>
      <Pagination
        :page="tag.items.page"
        :page-count="tag.items.pageCount"
        :pending="resource.status.value === 'pending'"
      />
    </section>
  </main>
</template>
