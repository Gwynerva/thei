<script lang="ts" setup>
import type { ProjectListItem } from '#layers/thei/shared/api/project';
import projectSvg from '~/assets/fallback/project.svg?raw';

definePageMeta({ layout: 'admin' });

await useAdminTabTitle(computed(() => phrase.value.admin_projects));

const humanSize = useHumanSize();

const LIMIT = 50;

const { data: initial, error } = await useFetch<ProjectListItem[]>(
  '/api/admin/projects/',
  { query: { offset: 0 }, key: 'admin-projects' },
);

const projects = ref<ProjectListItem[]>(initial.value ?? []);
const loadingMore = ref(false);
const hasMore = ref((initial.value?.length ?? 0) >= LIMIT);

const sentinelEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const page = await $fetch<ProjectListItem[]>('/api/admin/projects/', {
      query: { offset: projects.value.length },
    });
    projects.value.push(...page);
    if (page.length < LIMIT) hasMore.value = false;
  } finally {
    loadingMore.value = false;
  }
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    },
    { rootMargin: '200px' },
  );
  if (sentinelEl.value) observer.observe(sentinelEl.value);
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)">
    <div class="flex items-center justify-between gap-xs py-xs">
      <div class="flex min-w-0 items-center gap-xs text-xl font-bold">
        <Icon name="project" class="shrink-0" />
        <span class="truncate">{{ phrase.admin_projects }}</span>
      </div>
      <TheiLink
        to="/admin/projects/add"
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
    <div
      v-if="error"
      class="mb-md rounded-normal border border-border-error bg-bg-error p-xs
        text-text-error"
    >
      <Icon name="warning" class="mr-xs" />
      <span>{{ phrase.failed_to_fetch_data }}</span>
      <span v-if="error.message" class="ml-xs">{{ error.message }}</span>
    </div>
    <Box v-if="projects.length">
      <div class="overflow-auto">
        <table class="w-full">
          <thead>
            <tr class="th">
              <th
                scope="col"
                class="w-full min-w-40 rounded-tl-normal p-td-tight text-left"
              >
                {{ phrase.project }}
              </th>
              <th
                scope="col"
                class="min-w-36 p-td-tight text-left max-sm:hidden"
              >
                {{ phrase.updated_at }}
              </th>
              <th scope="col" class="p-td-tight text-left">
                {{ phrase.size }}
              </th>
              <th scope="col" class="rounded-tr-normal"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="project in projects"
              :key="project.projectUuid"
              class="tr-normal"
            >
              <td class="max-w-0 min-w-70">
                <div class="flex min-w-0 items-center gap-sm">
                  <TheiLink
                    :to="`/admin/projects/edit/${project.projectUuid}/`"
                    class="group flex min-w-0 flex-1 items-center gap-sm py-sm
                      pl-sm transition"
                  >
                    <img
                      v-if="project.iconPreviewUrl"
                      :src="project.iconPreviewUrl"
                      class="size-8 shrink-0 rounded-sm object-cover"
                      alt=""
                    />
                    <TintedIcon
                      v-else
                      :svg="projectSvg"
                      :seed="project.projectUuid"
                      class="size-8 shrink-0 rounded-sm"
                    />
                    <div class="min-w-0">
                      <p
                        class="font-semibold wrap-break-word transition
                          group-hocus:text-accent"
                      >
                        {{ project.title }}
                      </p>
                      <p
                        class="text-sm wrap-break-word text-text-2
                          max-sm:hidden"
                      >
                        {{ project.summary }}
                      </p>
                    </div>
                  </TheiLink>
                  <div
                    class="flex shrink-0 items-center gap-xs pr-sm text-base"
                  >
                    <Icon
                      v-if="project.important"
                      name="star"
                      :data-title-popup="phrase.important_project_label"
                      class="cursor-help text-text-3 transition
                        hocus:text-text-1"
                    />
                    <Icon
                      v-if="project.cv"
                      name="case-important"
                      :data-title-popup="phrase.cv_project_label"
                      class="cursor-help text-text-3 transition
                        hocus:text-text-1"
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
                      class="cursor-help text-text-3 transition
                        hocus:text-text-1"
                    />
                  </div>
                </div>
              </td>
              <td class="p-td text-text-2 max-sm:hidden">
                <TheiTime :datetime="project.updatedAt" class="text-sm" />
                <div
                  v-if="project.createdAt !== project.updatedAt"
                  class="mt-0.5 block text-xs text-text-3"
                >
                  <Icon
                    name="plus-circle"
                    class="mr-1 cursor-help"
                    :data-title-popup="phrase.created_at"
                  />
                  <TheiTime :datetime="project.createdAt" class="" />
                </div>
              </td>
              <td class="p-td text-sm whitespace-nowrap text-text-2">
                {{ humanSize(project.totalSize) }}
              </td>
              <td class="p-td pr-sm text-center">
                <TheiLink
                  :to="`/projects/${project.slug}/`"
                  external
                  :data-title-popup="phrase.view_project"
                  class="cursor-pointer text-text-2/50 transition
                    hocus:text-text-1"
                >
                  <Icon name="eye-open" class="text-lg" />
                </TheiLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loadingMore" class="flex justify-center p-sm">
        <Icon name="loading" class="text-lg text-text-2" />
      </div>
    </Box>
  </div>
  <div ref="sentinelEl" />
</template>
