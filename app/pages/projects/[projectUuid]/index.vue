<script lang="ts" setup>
import type { PublicProjectResponse } from '#layers/thei/shared/api/public';
import type { PublicDetailPanelData } from '#layers/thei/app/components/public/public-detail';
import { buildProjectUrl } from '#layers/thei/shared/project-url';

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
usePublicSeo({
  title: () => data.value.title,
  description: () => data.value.summary,
  canonical,
  noIndex: () => data.value.access === 'link-only',
});
const linkCount = computed(
  () =>
    data.value.references.manual.links.length +
    data.value.references.content.links.length,
);
const fileCount = computed(
  () =>
    data.value.references.manual.files.length +
    data.value.references.content.files.length,
);
const details = computed(
  () =>
    ({
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
        {
          icon: 'history',
          label: phrase.value.project_chronology_updated,
          date: data.value.chronology.updatedAt,
        },
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
      :is-showcase="data.isShowcase"
      :is-portfolio="data.isPortfolio"
    />

    <div class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
      <PublicDetailLayout :details="details" :content="data.description">
        <div class="flex min-w-0 flex-col gap-lg">
          <ContentRenderer
            v-if="data.description?.blocks.length"
            :data="data.description"
            asset-viewer
          />

          <section
            v-if="data.sections.length"
            id="sections"
            aria-labelledby="sections-heading"
            class="flex scroll-mt-32 flex-col gap-sm"
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
            id="stages"
            aria-labelledby="stages-heading"
            class="flex scroll-mt-32 flex-col gap-sm"
          >
            <PublicSectionHeader
              heading-id="stages-heading"
              :title="phrase.project_stages"
              icon="calendar"
            />
            <PublicProjectStageTimeline :items="data.stages" />
          </section>
        </div>
      </PublicDetailLayout>
    </div>
  </main>
</template>
