<script lang="ts" setup>
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
usePublicSeo({
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.project.access === 'link-only',
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
            value: data.value.references.content.links.length,
          },
          {
            icon: 'files',
            label: phrase.value.public_details_files,
            value: data.value.references.content.files.length,
          },
        ] satisfies PublicDetailPanelData['metrics']
      ).filter((metric) => metric.value > 0),
    }) satisfies PublicDetailPanelData,
);
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
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
