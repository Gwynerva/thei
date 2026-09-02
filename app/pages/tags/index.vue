<script lang="ts" setup>
import type { PublicTagListItem } from '#layers/thei/shared/api/public';
import { buildTagUrl } from '#layers/thei/shared/tag-url';

definePageMeta({ layout: 'public' });
const resource = await useFetch<PublicTagListItem[]>('/api/tags');
const tags = useRequiredResource(resource);
usePublicSeo({
  title: computed(() => phrase.value.tags),
  description: computed(() => phrase.value.public_tags_description),
  canonical: '/tags/',
});
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="tag"
      :title="phrase.tags"
      :description="phrase.public_tags_description"
    />
    <div v-if="tags.length" class="grid gap-sm sm:grid-cols-2">
      <TheiLink
        v-for="tag in tags"
        :key="tag.publicId"
        :to="buildTagUrl(tag.slug, tag.publicId)"
        class="group flex items-center gap-sm rounded-normal border
          border-border-1 bg-bg-2 p-sm shadow-md shadow-shadow-1 transition
          sm:p-md hocus:-translate-y-0.5 hocus:border-border-2"
      >
        <TagIcon :tag="tag" class="size-12 shrink-0 rounded-normal" />
        <span class="min-w-0 flex-1">
          <strong
            class="block truncate text-lg tracking-tight
              group-hocus:text-accent"
            >{{ tag.title }}</strong
          >
          <span
            v-if="tag.description"
            class="mt-1 line-clamp-2 block text-sm text-text-2"
            >{{ tag.description }}</span
          >
          <span class="mt-2 flex gap-xs text-xs font-semibold text-text-3">
            <span>{{ tag.projectCount }} · {{ phrase.projects }}</span>
            <span>{{ tag.eventCount }} · {{ phrase.events }}</span>
          </span>
        </span>
      </TheiLink>
    </div>
    <PublicEmptyState v-else icon="tag" :title="phrase.tags" />
  </main>
</template>
