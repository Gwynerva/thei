<script lang="ts" setup>
import {
  sortPublicProjectReferencesByRelationType,
  type PublicDetailPanelData,
} from './public-detail';
import { buildLifeUrl } from '#layers/thei/shared/life';
import { isPublicSecret } from '#layers/thei/shared/api/public';
import { publicReferenceSplitSize } from '#layers/thei/shared/public-references';

const { data } = defineProps<{ data: PublicDetailPanelData }>();
const emit = defineEmits<{
  navigate: [id: string, event: MouseEvent];
}>();

function navigate(id: string, event: MouseEvent) {
  emit('navigate', id, event);
}
const relatedProjectLinks = computed(() =>
  sortPublicProjectReferencesByRelationType(data.relatedProjects ?? []).map(
    (project) =>
      isPublicSecret(project)
        ? project
        : {
            kind: 'project' as const,
            title: project.title,
            href: project.href,
            description: project.summary,
            iconMedia: project.iconMedia,
            relationType: project.relationType,
          },
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
      v-if="publicReferenceSplitSize(data.references.links)"
      :title="phrase.public_details_links"
    >
      <PublicReferenceSplitList
        v-slot="{ items }"
        :split="data.references.links"
      >
        <PublicReferenceLinks :links="items" />
      </PublicReferenceSplitList>
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="publicReferenceSplitSize(data.references.files)"
      :title="phrase.public_details_files"
    >
      <PublicReferenceSplitList
        v-slot="{ items }"
        :split="data.references.files"
      >
        <PublicFiles :files="items" compact />
      </PublicReferenceSplitList>
    </PublicCollapsibleSection>
  </div>
</template>
