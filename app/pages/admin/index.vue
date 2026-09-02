<script lang="ts" setup>
import type { ProjectListResponse } from '#layers/thei/shared/api/project';
import type { EventListResponse } from '#layers/thei/shared/api/event';
import type { PageListResponse } from '#layers/thei/shared/api/page';

definePageMeta({ layout: 'admin' });

await useAdminTabTitle(computed(() => phrase.value.admin_panel));

const [projectsResult, eventsResult, pagesResult, tagsResult] =
  await Promise.all([
    useFetch<ProjectListResponse>('/api/admin/projects', {
      query: { order: 'newest', page: 1, pageSize: 5 },
      key: 'admin-dashboard-projects',
    }),
    useFetch<EventListResponse>('/api/admin/events', {
      query: { order: 'newest', page: 1, pageSize: 5 },
      key: 'admin-dashboard-events',
    }),
    useFetch<PageListResponse>('/api/admin/pages', {
      query: { order: 'newest', page: 1, pageSize: 1 },
      key: 'admin-dashboard-pages',
    }),
    useFetch<{ count: number }>('/api/admin/tags/stats', {
      key: 'admin-tag-count',
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

    <div class="mb-lg flex flex-wrap items-stretch gap-md">
      <AdminEntityOverview
        class="min-w-0 flex-1 basis-96"
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
        class="min-w-0 flex-1 basis-96"
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
    </div>

    <div class="mb-lg grid gap-md sm:grid-cols-2">
      <TheiLink to="/admin/pages/" class="group">
        <Box class="h-full">
          <div class="flex items-center justify-between gap-md p-md">
            <div class="flex min-w-0 items-center gap-sm">
              <div
                class="flex size-12 shrink-0 items-center justify-center
                  rounded-normal bg-accent/20 text-xl text-accent transition
                  group-hocus:bg-accent/30"
              >
                <Icon name="page" />
              </div>
              <div class="min-w-0">
                <p class="font-semibold transition group-hocus:text-accent">
                  {{ phrase.admin_pages }}
                </p>
                <p class="text-sm text-text-3">
                  {{ phrase.admin_pages_description }}
                </p>
              </div>
            </div>
            <span class="shrink-0 text-2xl font-bold text-text-2">
              {{ pagesResult.data.value?.total ?? 0 }}
            </span>
          </div>
        </Box>
      </TheiLink>

      <TheiLink to="/admin/tags/" class="group">
        <Box class="h-full">
          <div class="flex items-center justify-between gap-md p-md">
            <div class="flex min-w-0 items-center gap-sm">
              <div
                class="flex size-12 shrink-0 items-center justify-center
                  rounded-normal bg-accent/20 text-xl text-accent transition
                  group-hocus:bg-accent/30"
              >
                <Icon name="tag" />
              </div>
              <div class="min-w-0">
                <p class="font-semibold transition group-hocus:text-accent">
                  {{ phrase.admin_tags }}
                </p>
                <p class="text-sm text-text-3">{{ phrase.tags_description }}</p>
              </div>
            </div>
            <span class="shrink-0 text-2xl font-bold text-text-2">
              {{ tagsResult.data.value?.count ?? 0 }}
            </span>
          </div>
        </Box>
      </TheiLink>
    </div>

    <AdminSessions />
  </div>
</template>
