<script lang="ts" setup>
import type { PublicProjectStageResponse } from '#layers/thei/shared/api/public';
import { buildProjectChildUrl } from '#layers/thei/shared/project-url';
import type { PublicDetailPanelData } from '#layers/thei/app/components/public/public-detail';

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
usePublicSeo({
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.project.access === 'link-only',
});
const details = computed(
  () =>
    ({
      periods: data.value.periods,
      references: data.value.references,
      metrics: (
        [
          {
            icon: 'calendar',
            label: phrase.value.public_details_chronology,
            value: data.value.periods.length,
          },
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
      icon="calendar"
      :title="data.title"
      :description="data.summary"
      :back-link="data.project"
    />
    <PublicDetailLayout :details="details" :content="data.content">
      <ContentRenderer
        v-if="data.content?.blocks.length"
        :data="data.content"
        asset-viewer
      />
    </PublicDetailLayout>
  </main>
</template>
