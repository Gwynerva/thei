<script lang="ts" setup>
import type { PublicProjectResponse } from '#layers/thei/shared/api/public';
import {
  createdAndUpdatedTimelineItems,
  firstAndLastTimelineItems,
  type PublicDetailPanelData,
} from '#layers/thei/app/components/public/public-detail';
import {
  buildProjectTimelineUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import {
  buildContentHeadings,
  type ContentHeading,
} from '#layers/thei/app/components/content/content-headings';
import type { IconName } from '#thei/icons';

import { publicOwnerNotesHeading } from '#layers/thei/app/components/public/PublicOwnerNotes.vue';

definePageMeta({ layout: 'public', key: (route) => route.path });
const route = useRoute();
const resource = await useFetch<PublicProjectResponse>(
  () => `/api/projects/${encodeURIComponent(String(route.params.projectUuid))}`,
);
const data = useRequiredResource(resource);
// The hero already paints the page top.
usePublicPageGlow({ enabled: false });
const canonical = computed(() =>
  buildProjectUrl(data.value.humanReadableSlug, data.value.publicId),
);
if (route.path !== canonical.value)
  await navigateTo(canonical.value, { redirectCode: 301 });
const ogImage = useOgImage(
  'project',
  () => data.value.publicId,
  () => [
    data.value.title,
    data.value.bannerMedia?.src,
    data.value.iconMedia.src,
  ],
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
  image: () => (data.value.bannerMedia ?? data.value.iconMedia).src,
  entities: () => [
    {
      '@type': 'CreativeWork',
      '@id': '#project',
      name: data.value.title,
      description: data.value.summary,
      dateCreated: data.value.chronology.createdAt,
      ...(data.value.chronology.updatedAt
        ? { dateModified: data.value.chronology.updatedAt }
        : {}),
      image: (data.value.bannerMedia ?? data.value.iconMedia).src,
      ...(data.value.tags.length
        ? { keywords: data.value.tags.map((tag) => tag.title).join(', ') }
        : {}),
      ...(data.value.stages.length + data.value.sections.length
        ? {
            hasPart: [...data.value.sections, ...data.value.stages].map(
              (part) => ({ '@type': 'CreativeWork', url: part.href }),
            ),
          }
        : {}),
    },
  ],
});
const timelineHref = computed(() =>
  buildProjectTimelineUrl(data.value.humanReadableSlug, data.value.publicId),
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
      id: 'project-sections',
      title: phrase.value.project_content_sections,
      icon: 'file-tray-stack',
      shown: data.value.sections.length > 0,
    },
    {
      id: 'project-timeline',
      title: phrase.value.project_timeline_latest,
      icon: 'heart',
      shown: data.value.timeline.latest.length > 0,
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
      chronology: [
        ...createdAndUpdatedTimelineItems(data.value.chronology, {
          created: phrase.value.project_chronology_page,
          updated: phrase.value.project_chronology_updated,
        }),
        ...firstAndLastTimelineItems(
          data.value.stages,
          (stage) => ({ date: stage.period.startDate, href: stage.href }),
          {
            icon: 'calendar',
            first: phrase.value.project_chronology_first_stage,
            last: phrase.value.project_chronology_last_stage,
            only: phrase.value.project_chronology_stage,
          },
        ),
        ...firstAndLastTimelineItems(
          data.value.sections,
          (section) => ({ date: section.date, href: section.href }),
          {
            icon: 'file-tray-stack',
            first: phrase.value.project_chronology_first_section,
            last: phrase.value.project_chronology_last_section,
            only: phrase.value.project_chronology_section,
          },
        ),
        ...firstAndLastTimelineItems(
          [data.value.chronology.firstStatusAt, data.value.currentStatus],
          (mark) =>
            typeof mark === 'string'
              ? { date: mark, href: '#statuses' }
              : mark && {
                  date: new Date(mark.createdAt).toISOString().slice(0, 10),
                  href: '#statuses',
                },
          {
            icon: 'pulse',
            first: phrase.value.project_chronology_first_status,
            last: phrase.value.project_chronology_last_status,
            only: phrase.value.project_status,
          },
        ),
        ...firstAndLastTimelineItems(
          data.value.diaryEntries,
          (entry) => ({ date: entry.date, href: entry.href }),
          {
            icon: 'thought',
            first: phrase.value.project_chronology_first_diary,
            last: phrase.value.project_chronology_last_diary,
            only: phrase.value.diary_entry,
          },
        ),
      ],
      tags: data.value.tags,
      relatedEntities: data.value.relatedEntities,
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
    <PublicProjectHero
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
    </PublicProjectHero>

    <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
      <PublicShareNotice />
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

          <section
            v-if="data.sections.length"
            id="project-sections"
            aria-labelledby="sections-heading"
            class="flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col
              gap-sm"
          >
            <PublicSectionHeader
              heading-id="sections-heading"
              :title="phrase.project_content_sections"
              icon="file-tray-stack"
            />
            <div class="grid gap-sm">
              <PublicProjectChildCard
                v-for="section in data.sections"
                :key="section.href"
                :item="section"
                kind="section"
              />
            </div>
          </section>

          <section
            v-if="data.timeline.latest.length"
            id="project-timeline"
            aria-labelledby="timeline-heading"
            class="flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col
              gap-sm"
          >
            <PublicSectionHeader
              heading-id="timeline-heading"
              :title="phrase.project_timeline_latest"
              icon="heart"
              :action="{
                href: timelineHref,
                label: phrase.view_all,
                count: data.timeline.total,
                icon: 'arrow-outward',
              }"
            />
            <!-- One card per row: the sidebar already narrows this column. -->
            <div class="flex flex-col gap-sm">
              <LifePointCard
                v-for="point in data.timeline.latest"
                :key="point.key"
                :point="point"
                date-style="long"
                compact
              />
            </div>
          </section>
          <PublicOwnerNotes :notes="data.notes" />
        </div>
      </PublicDetailLayout>
    </div>
  </main>
</template>
