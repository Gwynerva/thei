<script lang="ts" setup>
import type { PublicTagResponse } from '#layers/thei/shared/api/public';
import { buildTagUrl } from '#layers/thei/shared/tag-url';

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
const canonical = computed(() =>
  buildTagUrl(tag.value.slug, tag.value.publicId),
);
if (route.path !== canonical.value)
  await navigateTo(
    { path: canonical.value, query: route.query },
    { redirectCode: 301 },
  );
usePublicSeo({
  title: computed(() => tag.value.title),
  description: computed(
    () => tag.value.description ?? phrase.value.public_tags_description,
  ),
  canonical,
});

function tabTo(tab: 'projects' | 'events') {
  return {
    path: canonical.value,
    query: tab === 'events' ? { tab: 'events' } : {},
  };
}
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="tag"
      :title="tag.title"
      :description="tag.description"
    >
      <TagIcon :tag="tag" class="mt-sm size-12 rounded-normal" />
    </PublicPageHeader>

    <div
      role="tablist"
      class="grid grid-cols-2 rounded-normal bg-bg-3 p-1 text-sm font-semibold"
      :aria-label="tag.title"
    >
      <TheiLink
        :to="tabTo('projects')"
        role="tab"
        :aria-selected="tag.activeTab === 'projects'"
        aria-controls="tag-entities"
        class="rounded-sm px-xs py-xs text-center transition hocus:text-accent"
        :class="
          tag.activeTab === 'projects'
            ? 'bg-bg-1 text-text-1 shadow-sm'
            : 'text-text-2'
        "
      >
        {{ phrase.projects_count(tag.projectCount) }}
      </TheiLink>
      <TheiLink
        :to="tabTo('events')"
        role="tab"
        :aria-selected="tag.activeTab === 'events'"
        aria-controls="tag-entities"
        class="rounded-sm px-xs py-xs text-center transition hocus:text-accent"
        :class="
          tag.activeTab === 'events'
            ? 'bg-bg-1 text-text-1 shadow-sm'
            : 'text-text-2'
        "
      >
        {{ phrase.events_count(tag.eventCount) }}
      </TheiLink>
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
