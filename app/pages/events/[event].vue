<script lang="ts" setup>
import type { PublicEventResponseFull } from '#layers/thei/shared/api/public';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { coverDatedPeriods } from '#layers/thei/shared/date-precision';
import {
  createdAndUpdatedTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';

import { publicOwnerNotesHeading } from '#layers/thei/app/components/public/PublicOwnerNotes.vue';
import { publicDiarySectionHeading } from '#layers/thei/app/components/public/PublicDiarySection.vue';

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
  data.value.periods.length ? coverDatedPeriods(data.value.periods) : undefined,
);
const ogImage = useOgImage(
  'event',
  () => data.value.publicId,
  () => [data.value.title, data.value.summary],
);
usePublicSeo({
  ogImage,
  markdown: true,
  ogType: 'article',
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
      chronology: createdAndUpdatedTimelineItems(data.value.chronology, {
        created: phrase.value.event_chronology_created,
        updated: phrase.value.event_chronology_updated,
      }),
      tags: data.value.tags,
      relatedEntities: data.value.relatedEntities,
      references: data.value.references,
    }) satisfies PublicDetailPanelData,
);

/**
 * The sections that live below the content but belong in its table.
 *
 * The diary block comes first because a visitor sees it; the owner's notes,
 * which nobody else gets at all, stay last.
 */
const extraContents = computed(() => [
  ...(data.value.diaryEntries.length
    ? [publicDiarySectionHeading(phrase.value.diary_entries)]
    : []),
  ...(data.value.notes?.blocks.length
    ? [publicOwnerNotesHeading(phrase.value.entity_notes)]
    : []),
]);
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicShareNotice />
    <PublicPageHeader
      icon="event"
      :title="data.title"
      :description="data.summary"
    >
      <PublicAction v-if="data.action" :action="data.action" />
    </PublicPageHeader>
    <PublicReminderNotice :reminder="data.reminder" />
    <PublicDetailLayout
      :details="details"
      :content="data.content"
      :extra-contents="extraContents"
    >
      <ContentRenderer
        v-if="data.content.blocks.length"
        :data="data.content"
        asset-viewer
      />
      <PublicDiarySection :entries="data.diaryEntries" />
      <PublicOwnerNotes :notes="data.notes" />
    </PublicDetailLayout>
  </main>
</template>
