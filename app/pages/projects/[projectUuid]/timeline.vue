<script lang="ts" setup>
import type { PublicProjectResponse } from '#layers/thei/shared/api/public';
import {
  buildLifeUrl,
  isLifeDay,
  parseLifeFilter,
  serializeLifeFilter,
  type LifeFilter,
  type LifeScopeRef,
  type LifeWindowResponse,
} from '#layers/thei/shared/life';
import { projectTimelinePreset } from '#layers/thei/shared/life-presets';
import { buildProjectTimelineUrl } from '#layers/thei/shared/project-url';

/**
 * A project's own chronology: the second tab of its page.
 *
 * The same feed as `/life/`, narrowed to what belongs to this project — its
 * stages and sections, its statuses, and the events and diary entries related
 * to it. The hero is the overview's hero, so switching tabs changes what is
 * under it and nothing else.
 */
definePageMeta({ layout: 'public', scrollToTop: false });

const route = useRoute();
const router = useRouter();
const part = String(route.params.projectUuid);
const projectResource = await useFetch<PublicProjectResponse>(
  () => `/api/projects/${encodeURIComponent(part)}`,
);
const project = useRequiredResource(projectResource);
usePublicPageGlow({ enabled: false });

const base = computed(() =>
  buildProjectTimelineUrl(
    project.value.humanReadableSlug,
    project.value.publicId,
  ),
);
if (route.path !== base.value)
  await navigateTo(
    { path: base.value, query: route.query },
    {
      redirectCode: 301,
    },
  );

const scope = computed<LifeScopeRef>(() => ({
  kind: 'project',
  publicId: project.value.publicId,
}));
const requestedDate = computed(() => {
  const value = route.query.d;
  if (typeof value !== 'string' || !value) return undefined;
  if (!isLifeDay(value))
    throw createResourceError({ statusCode: 404, statusText: 'Day not found' });
  return value;
});
const filter = ref<LifeFilter>(parseLifeFilter(route.query.f, scope.value));

const resource = await useFetch<LifeWindowResponse>(() => {
  const query = new URLSearchParams({ project: project.value.publicId });
  if (requestedDate.value) query.set('d', requestedDate.value);
  const serialized = serializeLifeFilter(filter.value);
  if (serialized) query.set('f', serialized);
  return `/api/life?${query}`;
});
if (resource.error.value) throw createResourceError(resource.error.value);
if (!resource.data.value) throw createResourceError({ statusCode: 502 });

const activeDate = ref(requestedDate.value ?? resource.data.value.anchorDate);

/**
 * Stages and sections used to have lists of their own; those filters are
 * still pages in their own right, with a name and a canonical. Any other
 * filter is a way of reading this page and points back at it.
 */
const preset = computed(() => projectTimelinePreset(filter.value));
const presetTitle = computed(() => {
  if (preset.value?.id === 'stages') return phrase.value.project_stages;
  if (preset.value?.id === 'sections')
    return phrase.value.project_content_sections;
  return undefined;
});
const ogImage = useOgImage(
  'project',
  () => project.value.publicId,
  () => [
    project.value.title,
    project.value.bannerMedia?.src,
    project.value.iconMedia.src,
  ],
);
usePublicSeo({
  ogImage,
  title: () =>
    `${presetTitle.value ?? phrase.value.project_tab_timeline} · ${project.value.title}`,
  description: () =>
    phrase.value.project_timeline_seo_description(project.value.title),
  canonical: () =>
    preset.value
      ? buildLifeUrl({ filter: preset.value.filter }, base.value)
      : base.value,
  noIndex: () => project.value.access === 'link-only',
  pageType: 'CollectionPage',
  breadcrumbs: () => [
    { name: phrase.value.search, path: '/search/?type=project' },
    {
      name: project.value.title,
      path: base.value.replace(/timeline\/$/, ''),
    },
  ],
});

watch(filter, (value) => {
  const query = { ...route.query };
  const serialized = serializeLifeFilter(value);
  if (serialized) query.f = serialized;
  else delete query.f;
  void router.replace({ path: route.path, query });
});
</script>

<template>
  <main
    class="flex flex-col"
    :data-life-active-date="activeDate"
    :data-life-newest-date="resource.data.value?.newestDate"
  >
    <PublicProjectHero
      :title="project.title"
      :summary="project.summary"
      :icon-media="project.iconMedia"
      :banner-media="project.bannerMedia"
      :action="project.action"
      :showcase="project.showcase"
      :tags="project.tags"
      :is-showcase="project.isShowcase"
      :is-cv="project.isCv"
    >
      <template #tabs>
        <PublicProjectTabs
          :human-readable-slug="project.humanReadableSlug"
          :public-id="project.publicId"
          :timeline-count="project.timeline.total"
          active="timeline"
        >
          <template #end>
            <LifeFilterButton
              v-model:filter="filter"
              :scope="scope"
              variant="tabs"
            />
          </template>
        </PublicProjectTabs>
      </template>
    </PublicProjectHero>

    <div class="m-auto w-(--width-wide) max-w-full px-window pt-lg">
      <PublicShareNotice />
    </div>
    <LifeFeed
      v-if="resource.data.value"
      v-model:filter="filter"
      v-model:active-date="activeDate"
      :initial="resource.data.value"
      :scope="scope"
      :base-path="base"
      scope-icon="project"
      :scope-media="project.iconMedia"
      :scope-label="project.title"
      :initial-date="requestedDate"
    />
  </main>
</template>
