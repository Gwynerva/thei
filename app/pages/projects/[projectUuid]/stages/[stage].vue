<script lang="ts" setup>
import type { PublicProjectStageResponse } from '#layers/thei/shared/api/public';
import { buildProjectChildUrl } from '#layers/thei/shared/project-url';
import {
  createdAndUpdatedTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicProjectStageResponse>(
  () =>
    `/api/projects/${encodeURIComponent(String(route.params.projectUuid))}/stages/${encodeURIComponent(String(route.params.stage))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() =>
  buildProjectChildUrl(
    data.value.project.humanReadableSlug,
    data.value.project.publicId,
    'stages',
    data.value.humanReadableSlug,
    data.value.publicId,
  ),
);
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });
const ogImage = useOgImage(() => ({ kind: 'stage', id: data.value.publicId }));
const seoImage = computed(() =>
  publicSeoImage(data.value.media, ogImage.value?.url),
);
usePublicSeo({
  ogImage,
  markdown: true,
  ogType: 'article',
  // The project is the context a stage or a section is read in, so the tab
  // and a shared link name it: "Stage - Project - Owner".
  title: () => `${data.value.title} - ${data.value.project.title}`,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.project.access === 'link-only',
  breadcrumbs: () => [
    { name: phrase.value.search, path: '/search/?type=project' },
    { name: data.value.project.title, path: data.value.project.href },
  ],
  image: seoImage,
  entities: () => [
    {
      '@type': 'Article',
      '@id': '#stage',
      headline: data.value.title,
      description: data.value.summary,
      author: publicSeoOwner,
      datePublished: data.value.chronology.createdAt,
      ...(data.value.chronology.updatedAt
        ? { dateModified: data.value.chronology.updatedAt }
        : {}),
      // The period of work the stage tells about, not when it was written.
      temporalCoverage: publicSeoTemporalCoverage(data.value.period),
      ...(seoImage.value ? { image: seoImage.value } : {}),
      isPartOf: {
        '@type': 'CreativeWork',
        '@id': `${data.value.project.href}#project`,
        name: data.value.project.title,
        url: data.value.project.href,
      },
    },
  ],
});
const details = computed(
  () =>
    ({
      periods: data.value.periods,
      neighbours: data.value.neighbours && {
        kind: 'project-stage',
        ...data.value.neighbours,
      },
      chronology: createdAndUpdatedTimelineItems(data.value.chronology, {
        created: phrase.value.stage_chronology_created,
        updated: phrase.value.stage_chronology_updated,
      }),
      references: data.value.references,
    }) satisfies PublicDetailPanelData,
);
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="calendar"
      :title="data.title"
      :description="data.summary"
      :parent="{ ...data.project, label: phrase.project_stage }"
    />
    <PublicDetailLayout :details="details" :content="data.content">
      <ContentRenderer
        v-if="data.content?.blocks.length"
        :data="data.content"
        asset-viewer
      />
      <PublicEmptyState
        v-else
        :title="phrase.public_stage_content_empty"
        :description="phrase.public_stage_content_empty_description"
      />
    </PublicDetailLayout>
  </main>
</template>
