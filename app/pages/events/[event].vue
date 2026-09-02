<script lang="ts" setup>
import type { PublicEventResponseFull } from '#layers/thei/shared/api/public';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import type { PublicDetailPanelData } from '#layers/thei/app/components/public/public-detail';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicEventResponseFull>(
  () => `/api/events/${encodeURIComponent(String(route.params.event))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() =>
  buildEventUrl(data.value.humanReadableSlug, data.value.publicId),
);
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });
usePublicSeo({
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.access === 'link-only',
});
const details = computed(
  () =>
    ({
      periods: data.value.periods,
      tags: data.value.tags,
      relatedProjects: data.value.relatedProjects,
      references: data.value.references,
      metrics: (
        [
          {
            icon: 'calendar',
            label: phrase.value.public_details_chronology,
            value: data.value.periods.length,
          },
          {
            icon: 'project',
            label: phrase.value.related_projects,
            value: data.value.relatedProjects.length,
          },
          {
            icon: 'link',
            label: phrase.value.public_details_links,
            value:
              data.value.references.manual.links.length +
              data.value.references.content.links.length,
          },
          {
            icon: 'files',
            label: phrase.value.public_details_files,
            value:
              data.value.references.manual.files.length +
              data.value.references.content.files.length,
          },
        ] satisfies PublicDetailPanelData['metrics']
      ).filter((metric) => metric.value > 0),
    }) satisfies PublicDetailPanelData,
);
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="event"
      :title="data.title"
      :description="data.summary"
    >
      <PublicAction v-if="data.action" :action="data.action" class="mt-xs" />
    </PublicPageHeader>
    <PublicDetailLayout :details="details" :content="data.content">
      <ContentRenderer
        v-if="data.content.blocks.length"
        :data="data.content"
        asset-viewer
      />
    </PublicDetailLayout>
  </main>
</template>
