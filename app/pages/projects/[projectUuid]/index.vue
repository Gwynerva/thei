<script lang="ts" setup>
import type { PublicProjectResponse } from '#layers/thei/shared/api/public';
import {
  createdAndUpdatedTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';
import {
  buildProjectUrl,
  PROJECT_SECTIONS_ANCHOR,
} from '#layers/thei/shared/project-url';
import {
  buildContentHeadings,
  type ContentHeading,
} from '#layers/thei/app/components/content/content-headings';
import type { IconName } from '#thei/icons';

import { publicOwnerNotesHeading } from '#layers/thei/app/components/public/PublicOwnerNotes.vue';
import {
  PUBLIC_RELATED_SECTION_ID,
  publicRelatedTotal,
} from '#layers/thei/app/components/public/PublicRelatedBlock.vue';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicProjectResponse>(
  () => `/api/projects/${encodeURIComponent(String(route.params.projectUuid))}`,
);
const data = useRequiredResource(resource);
const canonical = computed(() =>
  buildProjectUrl(data.value.humanReadableSlug, data.value.publicId),
);
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });
const ogImage = useOgImage(() => ({
  kind: 'project',
  id: data.value.publicId,
}));
const seoImage = computed(() =>
  publicSeoImage(
    data.value.bannerMedia ?? data.value.iconMedia,
    ogImage.value?.url,
  ),
);
usePublicSeo({
  ogImage,
  markdown: true,
  ogType: 'article',
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.access === 'link-only',
  breadcrumbs: () => [
    { name: phrase.value.search, path: '/search/?type=project' },
  ],
  image: seoImage,
  entities: () => [
    {
      '@type': 'CreativeWork',
      '@id': '#project',
      name: data.value.title,
      description: data.value.summary,
      author: publicSeoOwner,
      datePublished: data.value.chronology.createdAt,
      ...(data.value.chronology.updatedAt
        ? { dateModified: data.value.chronology.updatedAt }
        : {}),
      ...(seoImage.value ? { image: seoImage.value } : {}),
      ...(data.value.tags.length
        ? { keywords: data.value.tags.map((tag) => tag.title).join(', ') }
        : {}),
      ...(data.value.sections.length
        ? {
            // The same nodes the sections' own pages describe, by their @id.
            hasPart: data.value.sections.map((part) => ({
              '@type': 'Article',
              '@id': `${part.href}#section`,
              headline: part.title,
              url: part.href,
            })),
          }
        : {}),
    },
  ],
});
const relatedUrl = computed(
  () =>
    `/api/projects/${encodeURIComponent(String(route.params.projectUuid))}/related`,
);
// Headings of the description, then the page's own sections in page order.
const contents = computed<ContentHeading[]>(() => {
  const sections: {
    id: string;
    title: string;
    icon: IconName;
    shown: boolean;
  }[] = [
    {
      id: PROJECT_SECTIONS_ANCHOR,
      title: phrase.value.project_content_sections,
      icon: 'project-section',
      shown: data.value.sections.length > 0,
    },
    {
      id: PUBLIC_RELATED_SECTION_ID,
      title: phrase.value.related_entities,
      icon: 'arrow-cycle',
      shown: publicRelatedTotal(data.value.related) > 0,
    },
  ];
  return [
    ...(data.value.description
      ? buildContentHeadings(data.value.description, language.value.slugify)
      : []),
    ...sections
      .filter((section) => section.shown)
      .map(({ id, title, icon }) => ({
        id,
        title,
        icon,
        level: 2 as const,
        href: `#${id}`,
        path: `page:${id}`,
      })),
  ];
});
const details = computed(
  () =>
    ({
      contents: contents.value,
      chronology: createdAndUpdatedTimelineItems(data.value.chronology, {
        created: phrase.value.project_chronology_page,
        updated: phrase.value.project_chronology_updated,
      }),
      tags: data.value.tags,
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
  <main class="flex flex-col">
    <PublicHero
      :title="data.title"
      :summary="data.summary"
      :icon-media="data.iconMedia"
      :banner-media="data.bannerMedia"
      :action="data.action"
      :showcase="data.showcase"
      :tags="data.tags"
      :is-showcase="data.isShowcase"
      :is-cv="data.isCv"
    >
      <template #tabs>
        <PublicProjectTabs
          :human-readable-slug="data.humanReadableSlug"
          :public-id="data.publicId"
          :timeline-count="data.timeline.total"
          active="overview"
        />
      </template>
    </PublicHero>

    <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
      <PublicReminderNotice :reminder="data.reminder" />
      <PublicDetailLayout
        :details="details"
        :extra-contents="ownerNotesContents"
      >
        <div class="flex min-w-0 flex-col gap-lg">
          <PublicStatusBlock
            v-if="data.currentStatus"
            :current="data.currentStatus"
            :count="data.statusCount"
            :history-url="`/api/projects/${data.publicId}/statuses`"
            :title="phrase.project_status"
            compact
          />

          <ContentRenderer
            v-if="data.description?.blocks.length"
            :data="data.description"
            asset-viewer
          />

          <PublicProjectSections :sections="data.sections" />
          <PublicRelatedBlock :counts="data.related" :url="relatedUrl" />
          <PublicOwnerNotes :notes="data.notes" />
        </div>
      </PublicDetailLayout>
    </div>
  </main>
</template>
