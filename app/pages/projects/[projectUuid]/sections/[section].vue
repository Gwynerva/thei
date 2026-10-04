<script lang="ts" setup>
import type { PublicProjectSectionResponse } from '#layers/thei/shared/api/public';
import { buildProjectSectionUrl } from '#layers/thei/shared/project-url';
import {
  createdAndUpdatedTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicProjectSectionResponse>(
  () =>
    `/api/projects/${encodeURIComponent(String(route.params.projectUuid))}/sections/${encodeURIComponent(String(route.params.section))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() =>
  buildProjectSectionUrl(
    data.value.project.humanReadableSlug,
    data.value.project.publicId,
    data.value.humanReadableSlug,
    data.value.publicId,
  ),
);
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });
const ogImage = useOgImage(() => ({
  kind: 'section',
  id: data.value.publicId,
}));
const seoImage = computed(() =>
  publicSeoImage(data.value.media, ogImage.value?.url),
);
usePublicSeo({
  ogImage,
  markdown: true,
  ogType: 'article',
  // The project is the context a section is read in, so the tab and a
  // shared link name it: "Section - Project - Owner".
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
      '@id': '#section',
      headline: data.value.title,
      description: data.value.summary,
      author: publicSeoOwner,
      datePublished: data.value.chronology.createdAt,
      ...(data.value.chronology.updatedAt
        ? { dateModified: data.value.chronology.updatedAt }
        : {}),
      ...(seoImage.value ? { image: seoImage.value } : {}),
      // The stretch a dated section tells about, not when it was written.
      ...(data.value.period
        ? { temporalCoverage: publicSeoTemporalCoverage(data.value.period) }
        : {}),
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
        kind: 'project-section',
        ...data.value.neighbours,
      },
      chronology: createdAndUpdatedTimelineItems(data.value.chronology, {
        created: phrase.value.section_chronology_created,
        updated: phrase.value.section_chronology_updated,
      }),
      references: data.value.references,
    }) satisfies PublicDetailPanelData,
);
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="project-section"
      :title="data.title"
      :description="data.summary"
      :parent="{ ...data.project, label: phrase.content_section }"
    />
    <PublicDetailLayout :details="details" :content="data.content">
      <ContentRenderer
        v-if="data.content.blocks.length"
        :data="data.content"
        asset-viewer
      />
      <!-- A dated section may be only its dates; one about a topic that
           shows nothing has a body the visitor may not read. -->
      <PublicEmptyState
        v-else-if="data.periods.length"
        :title="phrase.public_section_dates_only"
        :description="phrase.public_section_dates_only_description"
      />
      <PublicEmptyState
        v-else
        :title="phrase.public_section_content_empty"
        :description="phrase.public_section_content_empty_description"
      />
    </PublicDetailLayout>
  </main>
</template>
