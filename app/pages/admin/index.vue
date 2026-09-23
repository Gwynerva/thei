<script lang="ts" setup>
import type { ProjectListResponse } from '#layers/thei/shared/api/project';
import type { EventListResponse } from '#layers/thei/shared/api/event';
import type { PageListResponse } from '#layers/thei/shared/api/page';
import type { DiaryListResponse } from '#layers/thei/shared/api/diary';
import type { AssetLibraryAvailability } from '#layers/thei/shared/asset-library';

definePageMeta({ layout: 'admin' });

await useAdminTabTitle(computed(() => phrase.value.admin_panel));

const [
  projectsResult,
  eventsResult,
  diaryResult,
  pagesResult,
  tagsResult,
  assetsResult,
] = await Promise.all([
  useFetch<ProjectListResponse>('/api/admin/projects', {
    query: { order: 'newest', page: 1, pageSize: 5 },
    key: 'admin-dashboard-projects',
  }),
  useFetch<EventListResponse>('/api/admin/events', {
    query: { order: 'newest', page: 1, pageSize: 5 },
    key: 'admin-dashboard-events',
  }),
  useFetch<DiaryListResponse>('/api/admin/diary', {
    query: { order: 'newest', page: 1, pageSize: 1 },
    key: 'admin-dashboard-diary',
  }),
  useFetch<PageListResponse>('/api/admin/pages', {
    query: { order: 'newest', page: 1, pageSize: 1 },
    key: 'admin-dashboard-pages',
  }),
  useFetch<{ count: number }>('/api/admin/tags/stats', {
    key: 'admin-tag-count',
  }),
  useFetch<AssetLibraryAvailability>('/api/admin/assets/availability', {
    key: 'admin-asset-count',
  }),
]);

const projectItems = computed(() =>
  (projectsResult.data.value?.items ?? []).map((project) => ({
    id: project.projectUuid,
    title: project.title,
    summary: project.summary,
    previewMedia: project.iconMedia,
    editTo: `/admin/projects/${project.projectUuid}/edit/`,
  })),
);
const eventItems = computed(() =>
  (eventsResult.data.value?.items ?? []).map((event) => ({
    id: event.eventUuid,
    title: event.title,
    summary: event.summary,
    previewMedia: event.previewMedia,
    editTo: `/admin/events/${event.eventUuid}/edit/`,
  })),
);
</script>

<template>
  <div class="m-auto flex w-(--width-wide) flex-col px-window py-lg">
    <AdminSiteStatus />

    <div class="mb-lg grid gap-md sm:grid-cols-2">
      <AdminEntityOverview
        class="min-w-0"
        entity-type="project"
        :title="phrase.admin_projects"
        :count="projectsResult.data.value?.total ?? 0"
        list-to="/admin/projects/"
        new-to="/admin/projects/new/"
        :new-label="phrase.new_project"
        :empty-label="phrase.no_projects"
        :items="projectItems"
        :error="Boolean(projectsResult.error.value)"
      />
      <AdminEntityOverview
        class="min-w-0"
        entity-type="event"
        :title="phrase.admin_events"
        :count="eventsResult.data.value?.total ?? 0"
        list-to="/admin/events/"
        new-to="/admin/events/new/"
        :new-label="phrase.new_event"
        :empty-label="phrase.no_events"
        :items="eventItems"
        :error="Boolean(eventsResult.error.value)"
      />
      <AdminDashboardLink
        to="/admin/diary/"
        icon="thought"
        :title="phrase.admin_diary"
        :description="phrase.admin_diary_description"
        :count="diaryResult.data.value?.total ?? 0"
      />
      <AdminDashboardLink
        to="/admin/tags/"
        icon="tag"
        :title="phrase.admin_tags"
        :description="phrase.tags_description"
        :count="tagsResult.data.value?.count ?? 0"
      />
      <AdminDashboardLink
        to="/admin/pages/"
        icon="page"
        :title="phrase.admin_pages"
        :description="phrase.admin_pages_description"
        :count="pagesResult.data.value?.total ?? 0"
      />
      <AdminDashboardLink
        to="/admin/assets/"
        icon="gallery"
        :title="phrase.asset_library"
        :description="phrase.asset_library_description"
        :count="assetsResult.data.value?.total ?? 0"
      />
      <AdminDashboardLink
        v-for="item in [
          {
            href: '/admin/about/',
            icon: 'person',
            title: phrase.about_me,
            description: phrase.profile_about_description,
          },
          {
            href: '/admin/settings/',
            icon: 'cog',
            title: phrase.site_settings,
            description: phrase.profile_settings_description,
          },
          {
            href: '/admin/updates/',
            icon: 'refresh',
            title: phrase.admin_updates,
            description: phrase.updates_description,
          },
        ]"
        :key="item.href"
        :to="item.href"
        :icon="item.icon"
        :title="item.title"
        :description="item.description"
      />
    </div>
    <AdminSessions />
  </div>
</template>
