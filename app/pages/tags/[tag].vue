<script lang="ts" setup>
import type { PublicTagResponse } from '#layers/thei/shared/api/public';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import type { TabItem } from '#layers/thei/app/components/UnderlineTabs.vue';
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

/** Each tab is an address of its own; one with nothing in it is not a link. */
const tabs = computed<TabItem<'projects' | 'events'>[]>(() =>
  (
    [
      ['projects', 'project', tag.value.projectCount, phrase.value.projects],
      ['events', 'event', tag.value.eventCount, phrase.value.events],
    ] as const
  ).map(([key, icon, count, label]) => ({
    key,
    icon,
    count,
    label,
    to: {
      path: baseCanonical.value,
      query: key === 'events' ? { tab: 'events' } : {},
    },
    disabled: !count,
  })),
);
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

    <!-- Each tab is an address of its own, so the row links rather than
         switches. -->
    <UnderlineTabs
      :model-value="tag.activeTab"
      :tabs
      :label="publicText(tag.title)"
      controls="tag-entities"
      class="max-sm:justify-center"
    />

    <section
      id="tag-entities"
      role="tabpanel"
      :aria-labelledby="`tag-entities-${tag.activeTab}-tab`"
      class="flex flex-col gap-sm"
    >
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
