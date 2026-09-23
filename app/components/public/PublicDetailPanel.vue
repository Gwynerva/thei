<script lang="ts" setup>
import type { PublicDetailPanelData } from './public-detail';
import { relationTypeIcon } from '#layers/thei/shared/relation-display';
import type { PublicEntityLink } from '#layers/thei/shared/api/public';
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
function asReferenceLink(entity: PublicEntityLink) {
  return isPublicSecret(entity)
    ? entity
    : {
        kind: entity.entityType,
        title: entity.title,
        href: entity.href,
        description: entity.note || entity.summary,
        iconMedia: entity.iconMedia,
        entityType: entity.entityType,
      };
}

/**
 * Related entities, split by what the relation says.
 *
 * Plain relations open the list unnamed; the two directed kinds are named from
 * this entity's side — what it leans on, and what leans on it.
 */
const relatedShared = computed(() =>
  (data.relatedEntities ?? [])
    .filter((entity) => (entity.relationType ?? 'related') === 'related')
    .map(asReferenceLink),
);
const relatedGroups = computed(() =>
  (
    [
      ['influencing', phrase.value.relation_group_depends_on],
      ['dependent', phrase.value.relation_group_affects],
    ] as const
  ).map(([type, title]) => ({
    key: type,
    icon: relationTypeIcon(type),
    title,
    items: (data.relatedEntities ?? [])
      .filter((entity) => entity.relationType === type)
      .map(asReferenceLink),
  })),
);
const relatedTotal = computed(
  () =>
    relatedShared.value.length +
    relatedGroups.value.reduce((sum, group) => sum + group.items.length, 0),
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
      :title="phrase.public_details_timeline"
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
          :href="buildLifeUrl({ date: data.createdAt })"
        />
      </div>
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="relatedTotal"
      :title="phrase.related_entities"
    >
      <PublicReferenceSplitList
        v-slot="{ items }"
        :shared="relatedShared"
        :groups="relatedGroups"
      >
        <PublicReferenceLinks :links="items" />
      </PublicReferenceSplitList>
    </PublicCollapsibleSection>
    <PublicCollapsibleSection
      v-if="data.diaryEntries?.length"
      :title="phrase.diary_entries"
    >
      <PublicDiaryLinks :entries="data.diaryEntries" />
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
