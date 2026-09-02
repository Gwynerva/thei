<script lang="ts" setup>
import {
  sortPublicProjectReferencesByRelationType,
  type PublicDetailPanelData,
} from './public-detail';
import { buildLifeUrl } from '#layers/thei/shared/life';

const { data } = defineProps<{ data: PublicDetailPanelData }>();
const emit = defineEmits<{
  navigate: [id: string, event: MouseEvent];
}>();

function navigate(id: string, event: MouseEvent) {
  emit('navigate', id, event);
}
const relatedProjectLinks = computed(() =>
  sortPublicProjectReferencesByRelationType(data.relatedProjects ?? []).map(
    (project) => ({
      kind: 'project' as const,
      title: project.title,
      href: project.href,
      description: project.summary,
      iconMedia: project.iconMedia,
      relationType: project.relationType,
    }),
  ),
);
</script>

<template>
  <div class="flex min-w-0 flex-col gap-md p-sm sm:p-0">
    <PublicCollapsibleSection
      v-if="data.contents?.length"
      :title="phrase.public_details_contents"
    >
      <PublicContentContents :items="data.contents" @navigate="navigate" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.chronology?.length"
      :title="phrase.public_details_chronology"
    >
      <PublicDetailTimeline :items="data.chronology" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.periods?.length"
      :title="phrase.public_details_chronology"
    >
      <PublicPeriodTimeline :periods="data.periods" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-else-if="data.createdAt"
      :title="phrase.public_details_when"
    >
      <div class="flex flex-wrap gap-xs">
        <DateRangeChip
          :period="{ startDate: data.createdAt, endDate: data.createdAt }"
          :href="buildLifeUrl(data.createdAt)"
        />
      </div>
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="relatedProjectLinks.length"
      :title="phrase.related_projects"
    >
      <PublicReferenceLinks :links="relatedProjectLinks" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection v-if="data.tags?.length" :title="phrase.tags">
      <PublicTagLinks :tags="data.tags" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.references.manual.links.length"
      :title="phrase.public_details_links"
    >
      <PublicReferenceLinks :links="data.references.manual.links" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.references.content.links.length"
      :title="phrase.public_details_links_content"
    >
      <PublicReferenceLinks :links="data.references.content.links" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.references.manual.files.length"
      :title="phrase.public_details_files"
    >
      <PublicFiles :files="data.references.manual.files" compact />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.references.content.files.length"
      :title="phrase.public_details_files_content"
    >
      <PublicFiles :files="data.references.content.files" compact />
    </PublicCollapsibleSection>
  </div>
</template>
