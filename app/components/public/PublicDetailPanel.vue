<script lang="ts" setup>
import type { PublicDetailPanelData } from './public-detail';
import { publicReferenceSplitSize } from '#layers/thei/shared/public-references';

const { data } = defineProps<{ data: PublicDetailPanelData }>();

/** Manual entries first, then whatever the content itself mentions. */
function referenceGroups<T>(split: { manual: T[]; content: T[] }) {
  return [
    {
      key: 'manual',
      icon: 'edit' as const,
      title: phrase.value.public_details_manual,
      items: split.manual,
    },
    {
      key: 'content',
      icon: 'text' as const,
      title: phrase.value.public_details_from_content,
      items: split.content,
    },
  ];
}
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
      v-if="data.periods?.length"
      :title="phrase.public_details_timeline"
    >
      <PublicPeriodTimeline :periods="data.periods" />
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.chronology?.length"
      :title="phrase.public_details_chronology"
    >
      <PublicDetailTimeline :items="data.chronology" />
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
        :shared="data.references.links.shared"
        :groups="referenceGroups(data.references.links)"
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
        :shared="data.references.files.shared"
        :groups="referenceGroups(data.references.files)"
      >
        <PublicFiles :files="items" compact />
      </PublicReferenceSplitList>
    </PublicCollapsibleSection>
  </div>
</template>
