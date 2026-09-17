<script lang="ts" setup>
import { publicReferenceSplitSize } from '#layers/thei/shared/public-references';
import type { PublicEventResponseFull } from '#layers/thei/shared/api/public';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { coverDateRanges } from '#layers/thei/shared/date-range';
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
const eventCover = computed(() =>
  data.value.periods.length ? coverDateRanges(data.value.periods) : undefined,
);
usePublicSeo({
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.access === 'link-only',
  breadcrumbs: () => [{ name: phrase.value.life, path: '/life/' }],
  entities: () => [
    {
      // An Event without a date is not an Event to a crawler, so a dateless
      // record stays a plain CreativeWork rather than an invalid node.
      '@type': eventCover.value ? 'Event' : 'CreativeWork',
      '@id': '#event',
      name: data.value.title,
      description: data.value.summary,
      ...(eventCover.value
        ? {
            startDate: eventCover.value.startDate,
            endDate: eventCover.value.endDate,
            eventStatus: 'https://schema.org/EventScheduled',
          }
        : {}),
      ...(data.value.tags.length
        ? { keywords: data.value.tags.map((tag) => tag.title).join(', ') }
        : {}),
    },
  ],
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
    <PublicPageHeader
      icon="event"
      :title="data.title"
      :description="data.summary"
    >
      <PublicAction v-if="data.action" :action="data.action" />
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
