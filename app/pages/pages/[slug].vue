<script lang="ts" setup>
import type { PublicPageResponse } from '#layers/thei/shared/api/page';
import {
  createdAndUpdatedTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { publicOwnerNotesHeading } from '#layers/thei/app/components/public/PublicOwnerNotes.vue';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicPageResponse>(
  () => `/api/pages/${encodeURIComponent(String(route.params.slug))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() => buildPageUrl(data.value.slug));
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });
const ogImage = useOgImage(
  'page',
  () => data.value.slug,
  () => [data.value.title, data.value.iconMedia.src],
);
usePublicSeo({
  ogImage,
  markdown: true,
  ogType: 'article',
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.access === 'link-only',
  breadcrumbs: () => [{ name: phrase.value.pages, path: '/pages/' }],
  image: () => data.value.iconMedia.src,
  entities: () => [
    {
      '@type': 'Article',
      '@id': '#page',
      headline: data.value.title,
      description: data.value.summary,
      datePublished: data.value.chronology.createdAt,
      ...(data.value.chronology.updatedAt
        ? { dateModified: data.value.chronology.updatedAt }
        : {}),
      image: data.value.iconMedia.src,
    },
  ],
});

const details = computed(
  () =>
    ({
      chronology: createdAndUpdatedTimelineItems(data.value.chronology, {
        created: phrase.value.page_chronology_created,
        updated: phrase.value.page_chronology_updated,
      }),
      references: data.value.references,
    }) satisfies PublicDetailPanelData,
);

const ownerNotesContents = computed(() =>
  data.value.notes?.blocks.length
    ? [publicOwnerNotesHeading(phrase.value.entity_notes)]
    : [],
);
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicPageHeader
      icon="page"
      :icon-media="data.iconMedia"
      :title="data.title"
      :description="data.summary"
    />
    <PublicReminderNotice :reminder="data.reminder" />
    <PublicDetailLayout
      :details="details"
      :content="data.content"
      :extra-contents="ownerNotesContents"
    >
      <ContentRenderer :data="data.content" asset-viewer />
      <PublicOwnerNotes :notes="data.notes" />
    </PublicDetailLayout>
  </main>
</template>
