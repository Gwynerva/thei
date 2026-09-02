<script lang="ts" setup>
import type {
  PublicEntitySummary,
  PublicPaginatedResponse,
} from '#layers/thei/shared/api/public';

definePageMeta({ layout: 'public' });
const route = useRoute();
const page = computed(() => String(route.query.page ?? '1'));
const resource = await useFetch<PublicPaginatedResponse<PublicEntitySummary>>(
  '/api/projects',
  { query: { page } },
);
const projects = useRequiredResource(resource);
usePublicSeo({
  title: computed(() => phrase.value.projects),
  description: computed(() => phrase.value.public_projects_description),
  canonical: '/projects/',
});
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="project"
      :title="phrase.projects"
      :description="phrase.public_projects_description"
    />
    <div v-if="projects.items.length" class="grid gap-sm sm:grid-cols-2">
      <PublicEntityCard
        v-for="project in projects.items"
        :key="project.href"
        :entity="project"
      />
    </div>
    <PublicEmptyState v-else icon="project" :title="phrase.projects" />
    <PublicPagination :page="projects.page" :page-count="projects.pageCount" />
  </main>
</template>
