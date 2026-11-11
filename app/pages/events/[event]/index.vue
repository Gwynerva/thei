<script lang="ts" setup>
import type { PublicEventResponseFull } from '#layers/thei/shared/api/public';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { coverDatedPeriods } from '#layers/thei/shared/date-precision';
import {
  createdAndUpdatedTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';
import { publicBelowTextContents } from '#layers/thei/app/components/public/public-page-contents';
import { publicExcerptParts } from '#layers/thei/app/components/public/PublicExcerptInline.vue';
import { EVENT_DESCRIPTION_ANCHOR } from '#layers/thei/shared/content-headings';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicEventResponseFull>(
  () => `/api/events/${encodeURIComponent(String(route.params.event))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() =>
  buildEventUrl(data.value.humanReadableSlug, data.value.publicId),
);
const relatedUrl = computed(
  () => `/api/events/${encodeURIComponent(String(route.params.event))}/related`,
);
const excerptsUrl = computed(
  () =>
    `/api/events/${encodeURIComponent(String(route.params.event))}/excerpts`,
);
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });
const eventCover = computed(() =>
  data.value.periods.length ? coverDatedPeriods(data.value.periods) : undefined,
);
const ogImage = useOgImage(() => ({ kind: 'event', id: data.value.publicId }));
const seoImage = computed(() =>
  publicSeoImage(data.value.media, ogImage.value?.url),
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
  image: seoImage,
  entities: () => [
    {
      // Not a schema.org `Event`: to a search engine that is a gathering
      // open to the public, with a venue and tickets, and it rejects one that
      // has none. The page is the owner's account of a moment of their life,
      // and when it happened is what the account covers.
      '@type': 'Article',
      '@id': '#event',
      headline: data.value.title,
      description: data.value.summary,
      author: publicSeoOwner,
      datePublished: data.value.chronology.createdAt,
      ...(data.value.chronology.updatedAt
        ? { dateModified: data.value.chronology.updatedAt }
        : {}),
      ...(eventCover.value
        ? { temporalCoverage: publicSeoTemporalCoverage(eventCover.value) }
        : {}),
      ...(seoImage.value ? { image: seoImage.value } : {}),
      ...(data.value.tags.length
        ? { keywords: data.value.tags.map((tag) => tag.title).join(', ') }
        : {}),
      ...publicExcerptParts(data.value.excerpts),
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
      references: data.value.references,
    }) satisfies PublicDetailPanelData,
);

const extraContents = computed(() => publicBelowTextContents(data.value));
</script>

<template>
  <main class="flex flex-col">
    <!-- A banner opens the page with it; without one, the plain header. -->
    <PublicHero
      v-if="data.bannerMedia"
      :title="data.title"
      :summary="data.summary"
      :banner-media="data.bannerMedia"
      :kind="{ icon: 'event', label: phrase.event }"
      :action="data.action"
    />
    <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
      <PublicPageHeader
        v-if="!data.bannerMedia"
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
        :content-start="{
          id: EVENT_DESCRIPTION_ANCHOR,
          title: phrase.public_event_description,
        }"
      >
        <ContentRenderer
          v-if="data.content.blocks.length"
          :id="EVENT_DESCRIPTION_ANCHOR"
          :data="data.content"
          asset-viewer
          class="scroll-mt-[var(--public-anchor-offset,8rem)]"
        />
        <PublicPageExcerpts
          :excerpts="data.excerpts"
          :secrets="data.excerptSecrets"
          :class="{ 'mt-lg': data.content.blocks.length }"
        />
        <PublicExcerptsBlock
          entity="event"
          :about="data.excerptsAbout"
          :url="excerptsUrl"
          class="mt-lg"
        />
        <PublicRelatedBlock
          entity="event"
          :counts="data.related"
          :url="relatedUrl"
          class="mt-lg"
        />
        <PublicOwnerNotes :notes="data.notes" class="mt-lg" />
      </PublicDetailLayout>
    </div>
  </main>
</template>
