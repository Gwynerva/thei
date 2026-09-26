<script lang="ts" setup>
import type { PublicTagListItem } from '#layers/thei/shared/api/public';
import type { PaginatedResponse } from '#layers/thei/shared/pagination';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import { tagAccentCssColor } from '#layers/thei/shared/tag';

definePageMeta({ layout: 'public' });
const route = useRoute();
const page = computed(() => String(route.query.page ?? '1'));
const resource = await useFetch<PaginatedResponse<PublicTagListItem>>(
  '/api/tags',
  { query: { page } },
);
const tags = useRequiredResource(resource);
const ogImage = useOgImage(
  'service',
  () => 'tags',
  () => ['tags'],
);
usePublicSeo({
  ogImage,
  title: computed(() => phrase.value.tags),
  description: computed(() => phrase.value.public_tags_description),
  canonical: computed(() =>
    buildPublicCanonical('/tags/', { page: tags.value.page }),
  ),
  pageType: 'CollectionPage',
  entities: () => [
    {
      '@type': 'ItemList',
      '@id': '#list',
      numberOfItems: tags.value.total,
      itemListElement: tags.value.items.map((item, index) => ({
        '@type': 'ListItem',
        position: (tags.value.page - 1) * tags.value.pageSize + index + 1,
        url: buildTagUrl(item.slug, item.publicId),
        name: item.title,
      })),
    },
  ],
});
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="tag"
      :title="phrase.tags"
      :description="phrase.public_tags_description"
    />
    <!--
      Rows are divided by a line above each one but the first of its column,
      so a lone last row never closes with a line that has nothing under it.
    -->
    <ul v-if="tags.items.length" class="grid gap-x-lg sm:grid-cols-2">
      <li
        v-for="tag in tags.items"
        :key="tag.publicId"
        class="group relative flex items-center gap-sm border-t border-border-1
          py-sm first:border-t-0 sm:nth-2:border-t-0"
        :style="{ '--tag-accent': tagAccentCssColor(tag) }"
      >
        <TheiLink
          :to="buildTagUrl(tag.slug, tag.publicId)"
          :aria-label="publicText(tag.title)"
          class="absolute inset-0 z-1 rounded-normal focus-visible:ring-2
            focus-visible:ring-accent"
        />
        <TagIcon
          v-if="tag.iconMedia"
          :tag="tag"
          class="pointer-events-none size-11 rounded-normal transition
            group-hocus:scale-105"
        />
        <!-- Without an icon of its own a tag still wears its colour, as its chip does. -->
        <span
          v-else
          class="tag-fallback-icon pointer-events-none flex size-11 shrink-0
            items-center justify-center rounded-normal text-xl transition
            group-hocus:scale-105"
          aria-hidden="true"
        >
          <Icon name="tag" />
        </span>
        <span class="pointer-events-none relative z-2 min-w-0 flex-1">
          <span class="flex min-w-0 items-center gap-sm">
            <strong
              class="truncate font-semibold tracking-tight transition
                group-hocus:text-accent"
              >{{ publicText(tag.title) }}</strong
            >
            <span
              class="flex shrink-0 items-center gap-sm text-xs font-semibold
                text-text-3"
            >
              <span
                v-if="tag.projectCount"
                class="pointer-events-auto relative z-3 flex cursor-help
                  items-center gap-1"
                role="img"
                :aria-label="phrase.x_projects(tag.projectCount)"
                :data-title-popup="phrase.x_projects(tag.projectCount)"
              >
                <Icon name="project" />{{ tag.projectCount }}
              </span>
              <span
                v-if="tag.eventCount"
                class="pointer-events-auto relative z-3 flex cursor-help
                  items-center gap-1"
                role="img"
                :aria-label="phrase.x_events(tag.eventCount)"
                :data-title-popup="phrase.x_events(tag.eventCount)"
              >
                <Icon name="event" />{{ tag.eventCount }}
              </span>
            </span>
          </span>
          <span
            v-if="tag.description"
            class="mt-0.5 line-clamp-1 text-sm text-text-2"
            >{{ publicText(tag.description) }}</span
          >
        </span>
      </li>
    </ul>
    <PublicEmptyState
      v-else
      :title="phrase.public_tags_empty"
      :description="phrase.public_tags_empty_description"
    />
    <Pagination
      :page="tags.page"
      :page-count="tags.pageCount"
      :pending="resource.status.value === 'pending'"
    />
  </main>
</template>

<style scoped>
/* The tag chip's fallback, as a tile: its accent over the surface. */
.tag-fallback-icon {
  background: color-mix(in oklab, var(--tag-accent) 16%, var(--color-bg-3));
  color: color-mix(in oklab, var(--tag-accent) 75%, var(--color-text-1));
}
</style>
