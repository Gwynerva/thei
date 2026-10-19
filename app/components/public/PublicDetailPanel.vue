<script lang="ts" setup>
import type { PublicDetailPanelData } from './public-detail';

const { data } = defineProps<{ data: PublicDetailPanelData }>();

const neighboursTitle = computed(() => {
  switch (data.neighbours?.kind) {
    case 'project-section':
      return phrase.value.public_details_neighbour_sections;
    default:
      return phrase.value.public_details_neighbour_entries;
  }
});
</script>

<template>
  <div class="flex min-w-0 flex-col gap-md p-sm sm:p-0">
    <PublicCollapsibleSection
      v-if="data.contents?.length"
      :title="phrase.public_details_contents"
    >
      <PublicContentContents :items="data.contents" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.neighbours?.next || data.neighbours?.previous"
      :title="neighboursTitle"
    >
      <PublicNeighbourLinks :neighbours="data.neighbours" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.periods?.length"
      :title="phrase.public_details_timeline"
      data-landing-zone="periods"
    >
      <PublicPeriodTimeline :periods="data.periods" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.chronology?.length"
      :title="phrase.public_details_chronology"
    >
      <PublicDetailTimeline :items="data.chronology" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.tags?.length"
      :title="phrase.tags"
      data-landing-zone="tags"
    >
      <PublicTagLinks :tags="data.tags" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.references?.links.length"
      :title="phrase.public_details_links"
      data-landing-zone="links"
    >
      <PublicLimitedList v-slot="{ items }" :items="data.references.links">
        <PublicReferenceLinks :links="items" />
      </PublicLimitedList>
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.references?.files.length"
      :title="phrase.public_details_files"
      data-landing-zone="files"
    >
      <PublicLimitedList v-slot="{ items }" :items="data.references.files">
        <PublicFiles :files="items" compact />
      </PublicLimitedList>
    </PublicCollapsibleSection>
  </div>
</template>
