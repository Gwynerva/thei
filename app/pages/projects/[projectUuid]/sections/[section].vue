<script lang="ts" setup>
import { publicReferenceSplitSize } from '#layers/thei/shared/public-references';
import type { PublicProjectSectionResponse } from '#layers/thei/shared/api/public';
import { buildProjectChildUrl } from '#layers/thei/shared/project-url';
import type { PublicDetailPanelData } from '#layers/thei/app/components/public/public-detail';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicProjectSectionResponse>(
  () =>
    `/api/projects/${encodeURIComponent(String(route.params.projectUuid))}/sections/${encodeURIComponent(String(route.params.section))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() =>
  buildProjectChildUrl(
    data.value.project.humanReadableSlug,
    data.value.project.publicId,
    'sections',
    data.value.humanReadableSlug,
    data.value.publicId,
  ),
);
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });
const ogImage = useOgImage(
  'section',
  () => data.value.publicId,
  () => [data.value.title, data.value.project.title],
);
usePublicSeo({
  ogImage,
  markdown: true,
  ogType: 'article',
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.project.access === 'link-only',
  breadcrumbs: () => [
    { name: phrase.value.search, path: '/search/?type=project' },
    { name: data.value.project.title, path: data.value.project.href },
  ],
  image: () => data.value.media?.src,
  entities: () => [
    {
      '@type': 'CreativeWork',
      '@id': '#section',
      name: data.value.title,
      description: data.value.summary,
      dateCreated: data.value.date,
      ...(data.value.media ? { image: data.value.media.src } : {}),
      isPartOf: {
        '@type': 'CreativeWork',
        name: data.value.project.title,
        url: data.value.project.href,
      },
    },
  ],
});
const details = computed(
  () =>
    ({
      createdAt: data.value.date,
      references: data.value.references,
      metrics: (
        [
          {
            icon: 'link',
            label: phrase.value.public_details_links,
            value: publicReferenceSplitSize(data.value.references.links),
          },
          {
            icon: 'files',
            label: phrase.value.public_details_files,
            value: publicReferenceSplitSize(data.value.references.files),
          },
        ] satisfies PublicDetailPanelData['metrics']
      ).filter((metric) => metric.value > 0),
    }) satisfies PublicDetailPanelData,
);
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicShareNotice />
    <PublicPageHeader
      icon="file-tray-stack"
      :title="data.title"
      :description="data.summary"
      :back-link="data.project"
    />
    <PublicDetailLayout :details="details" :content="data.content">
      <ContentRenderer :data="data.content" asset-viewer />
    </PublicDetailLayout>
  </main>
</template>
