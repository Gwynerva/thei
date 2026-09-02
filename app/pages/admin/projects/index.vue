<script lang="ts" setup>
import type {
  ProjectListItem,
  ProjectListResponse,
} from '#layers/thei/shared/api/project';
import { buildProjectUrl } from '#layers/thei/shared/project-url';

definePageMeta({ layout: 'admin' });

await useAdminTabTitle(computed(() => phrase.value.admin_projects));

const humanSize = useHumanSize();
const { data, error, status, search, order, setPage } =
  await useAdminEntityList<ProjectListItem>(
    '/api/admin/projects',
    'admin-projects',
  );
const list = computed<ProjectListResponse | undefined>(() => data.value);
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="project" class="shrink-0" />
        <span class="truncate">{{ phrase.admin_projects }}</span>
      </div>
      <TheiLink
        to="/admin/projects/new/"
        class="flex cursor-pointer items-center gap-xs rounded-normal
          bg-accent/80 px-sm py-xs text-sm text-white transition
          hocus:bg-accent"
      >
        <Icon name="plus-circle" />
        <span>{{ phrase.new_project }}</span>
      </TheiLink>
    </div>
  </StickyGlassHeader>

  <div class="m-auto w-(--width-wide) px-window py-lg">
    <AdminEntityListToolbar v-model:search="search" v-model:order="order" />

    <div
      v-if="error"
      class="mt-md rounded-normal border border-border-error bg-bg-error p-xs
        text-text-error"
    >
      <Icon name="warning" class="mr-xs" />
      <span>{{ phrase.failed_to_fetch_data }}</span>
      <span v-if="error.message" class="ml-xs">{{ error.message }}</span>
    </div>

    <Box v-if="list?.items.length" class="mt-md overflow-hidden">
      <div class="flex min-w-0 items-center th text-sm">
        <div class="min-w-0 flex-1 p-td-tight">{{ phrase.project }}</div>
        <div class="hidden w-20 shrink-0 sm:block"></div>
        <div class="hidden w-36 shrink-0 p-td-tight sm:block">
          {{ phrase.updated_at }}
        </div>
        <div class="w-24 shrink-0 p-td-tight">{{ phrase.size }}</div>
        <div class="hidden w-12 shrink-0 sm:block"></div>
      </div>

      <AdminEntityListItem
        v-for="project in list.items"
        :key="project.projectUuid"
        entity-type="project"
        :title="project.title"
        :summary="project.summary"
        :preview-media="project.iconMedia"
        :edit-to="`/admin/projects/${project.projectUuid}/edit/`"
      >
        <template #badges>
          <Icon
            v-if="project.showcase"
            name="star"
            :data-title-popup="phrase.showcase_project_label"
            class="cursor-help text-text-3 transition hocus:text-text-1"
          />
          <Icon
            v-if="project.cv"
            name="case-important"
            :data-title-popup="phrase.cv_project_label"
            class="cursor-help text-text-3 transition hocus:text-text-1"
          />
          <Icon
            :name="
              project.access === 'public'
                ? 'lock-open'
                : project.access === 'link-only'
                  ? 'lock-partial'
                  : 'lock-close'
            "
            :data-title-popup="
              project.access === 'public'
                ? phrase.public_hint
                : project.access === 'link-only'
                  ? phrase.link_only_hint
                  : phrase.private_hint
            "
            class="cursor-help text-text-3 transition hocus:text-text-1"
          />
        </template>
        <template #date>
          <div>
            <TheiTime :datetime="project.updatedAt" class="text-sm" />
            <div
              v-if="project.createdAt !== project.updatedAt"
              class="mt-0.5 text-xs text-text-3"
            >
              <Icon
                name="plus-circle"
                class="mr-1 cursor-help"
                :data-title-popup="phrase.created_at"
              />
              <TheiTime :datetime="project.createdAt" />
            </div>
          </div>
        </template>
        <template #size>{{ humanSize(project.totalSize) }}</template>
        <template #action>
          <TheiLink
            :to="buildProjectUrl(project.humanReadableSlug, project.publicId)"
            external
            :data-title-popup="phrase.view_project"
            :aria-label="phrase.view_project"
            class="cursor-pointer text-text-2/50 transition hocus:text-text-1"
          >
            <Icon name="visibility" class="text-lg" />
          </TheiLink>
        </template>
      </AdminEntityListItem>
    </Box>

    <div
      v-else-if="status !== 'pending' && !error"
      class="mt-md rounded-normal border border-border-1 bg-bg-2 p-md
        text-center text-sm text-text-3 italic"
    >
      {{ search.trim() ? phrase.admin_search_no_results : phrase.no_projects }}
    </div>

    <div v-if="status === 'pending'" class="flex justify-center p-md">
      <Icon name="loading" class="text-lg text-text-2" />
    </div>

    <AdminPagination
      v-if="list"
      :page="list.page"
      :page-count="list.pageCount"
      @page="setPage"
    />
  </div>
</template>
