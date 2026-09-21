<script lang="ts" setup>
import { publicReferenceSplitSize } from '#layers/thei/shared/public-references';
import type { PublicProjectResponse } from '#layers/thei/shared/api/public';
import type { PublicDetailPanelData } from '#layers/thei/app/components/public/public-detail';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import {
  buildContentHeadings,
  type ContentHeading,
} from '#layers/thei/app/components/content/content-headings';
import type { IconName } from '#thei/icons';

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
const linkCount = computed(() =>
  publicReferenceSplitSize(data.value.references.links),
);
const fileCount = computed(() =>
  publicReferenceSplitSize(data.value.references.files),
);
const eventsHref = computed(() => `${canonical.value}events/`);
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
      id: 'project-stages',
      title: phrase.value.project_stages,
      icon: 'calendar',
      shown: data.value.stages.length > 0,
    },
    {
      id: 'project-events',
      title: phrase.value.related_events,
      icon: 'event',
      shown: data.value.relatedEvents.total > 0,
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
        {
          icon: 'plus',
          label: phrase.value.project_chronology_page,
          date: data.value.chronology.createdAt,
        },
        ...(data.value.chronology.firstStageAt
          ? [
              {
                icon: 'calendar' as const,
                label: phrase.value.project_chronology_first_stage,
                date: data.value.chronology.firstStageAt,
              },
            ]
          : []),
        ...(data.value.chronology.lastStageAt
          ? [
              {
                icon: 'calendar' as const,
                label: phrase.value.project_chronology_last_stage,
                date: data.value.chronology.lastStageAt,
              },
            ]
          : []),
        ...(data.value.chronology.updatedAt
          ? [
              {
                icon: 'history' as const,
                label: phrase.value.project_chronology_updated,
                date: data.value.chronology.updatedAt,
              },
            ]
          : []),
      ],
      tags: data.value.tags,
      relatedProjects: data.value.relatedProjects,
      references: data.value.references,
      metrics: (
        [
          {
            icon: 'star',
            label: phrase.value.showcase,
            value: data.value.showcase.length,
          },
          {
            icon: 'calendar',
            label: phrase.value.project_stages,
            value: data.value.stages.length,
          },
          {
            icon: 'file-tray-stack',
            label: phrase.value.project_content_sections,
            value: data.value.sections.length,
          },
          {
            icon: 'event',
            label: phrase.value.related_events,
            value: data.value.relatedEvents.total,
          },
          {
            icon: 'link',
            label: phrase.value.public_details_references,
            value: linkCount.value + fileCount.value,
          },
        ] satisfies PublicDetailPanelData['metrics']
      ).filter((metric) => metric.value > 0),
    }) satisfies PublicDetailPanelData,
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
    />

    <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
      <PublicShareNotice />
      <PublicDetailLayout :details="details">
        <div class="flex min-w-0 flex-col gap-lg">
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
            v-if="data.stages.length"
            id="project-stages"
            aria-labelledby="stages-heading"
            class="flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col
              gap-sm"
          >
            <PublicSectionHeader
              heading-id="stages-heading"
              :title="phrase.project_stages"
              icon="calendar"
            />
            <PublicProjectStageTimeline :items="data.stages" />
          </section>

          <section
            v-if="data.relatedEvents.total"
            id="project-events"
            aria-labelledby="events-heading"
            class="flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col
              gap-sm"
          >
            <PublicSectionHeader
              heading-id="events-heading"
              :title="phrase.related_events"
              icon="event"
              :action="{
                href: eventsHref,
                label: phrase.view_all,
                count: data.relatedEvents.total,
                icon: 'arrow-outward',
              }"
            />
            <!-- One card per row: the sidebar already narrows this column. -->
            <div class="flex flex-col gap-sm">
              <PublicEntityCard
                v-for="item in data.relatedEvents.items"
                :key="item.href"
                :entity="item"
              />
            </div>
          </section>
        </div>
      </PublicDetailLayout>
    </div>
  </main>
</template>
