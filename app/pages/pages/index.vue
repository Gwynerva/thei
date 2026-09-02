<script lang="ts" setup>
import type { PublicPageListItem } from '#layers/thei/shared/api/page';

definePageMeta({ layout: 'public' });
const resource = await useFetch<PublicPageListItem[]>('/api/pages');
const pages = useRequiredResource(resource);
usePublicSeo({
  title: computed(() => phrase.value.pages),
  description: computed(() => phrase.value.public_pages_description),
  canonical: '/pages/',
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
    <PublicEmptyState v-else icon="page" :title="phrase.no_pages" />
  </main>
</template>
