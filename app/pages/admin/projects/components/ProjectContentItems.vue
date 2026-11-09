<script lang="ts" setup>
import { analyzeContentData } from '#layers/thei/shared/content';
import {
  isDatedSection,
  orderProjectSections,
  sortStagesNewestFirst,
  type ProjectSectionItem,
} from '#layers/thei/shared/project-content-item';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import { projectAssetUsageDelta } from '#layers/thei/shared/admin/project';
import {
  currentProjectUuidKey,
  projectDataInjectionKey,
  savedProjectDataInjectionKey,
  saveAfterItemEditKey,
} from '../composables';
import { projectContentItemModal } from './project-content-item-modal';
import ProjectContentItemRow from './ProjectContentItemRow.vue';

/**
 * A project's sections, in two tabs heading one block, as the relations
 * below are: the general ones, about a part of the project, in the order
 * they are dragged into, and the stages, about a stretch of time, newest
 * first, where the owner is working. Both tabs are always there, so the
 * owner sees where a section will go; a section moves between them as its
 * dates come and go.
 */

const projectData = inject(projectDataInjectionKey)!;
/** The project's AI: a section's own reads again when the project saves. */
const projectAi = useEntityAi();
const savedProjectData = inject(savedProjectDataInjectionKey)!;
const saveAfterItemEdit = inject(saveAfterItemEditKey, undefined);
const currentProjectUuid = inject(currentProjectUuidKey)!;
const route = useRoute();
const root = useTemplateRef<HTMLElement>('root');
const sections = computed(() => projectData.value.sections ?? []);
const undated = computed(() =>
  sections.value.filter((section) => !isDatedSection(section)),
);
const dated = computed(() => sortStagesNewestFirst(sections.value));
const selected = ref<SectionGroup>(
  undated.value.length || !dated.value.length ? 'undated' : 'dated',
);
const tabs = computed(() =>
  sectionGroupTabs({
    undated: undated.value.length,
    dated: dated.value.length,
  }),
);
const parts = useModalParts({
  uuid: 'sectionUuid',
  // `?section=<publicId>`: the admin bar on a public section page lands
  // here, and so does the form's own AI memory.
  query: 'section',
  items: () => sections.value,
  setItems,
  savedItems: () => savedProjectData.value.sections ?? [],
  atOwnAddress: () => route.params.projectUuid === currentProjectUuid.value,
  open: (target) => {
    selected.value = groupOf(target);
    return openItem(target);
  },
  root,
  handle: '[data-content-section-handle]',
  // Only the general sections are dragged, in their tab; the stages keep
  // the order of their dates.
  sorted: {
    items: () => undated.value,
    arrange: (sorted) => setItems([...sorted, ...dated.value]),
    shown: () => selected.value === 'undated',
  },
});
const itemViews = computed(() =>
  (selected.value === 'dated' ? dated.value : undated.value).map((item) => ({
    item,
    id: parts.itemId(item),
    media:
      item.bannerMedia ?? analyzeContentData(item.content?.data).preview.media,
  })),
);

function groupOf(item: ProjectSectionItem): SectionGroup {
  return isDatedSection(item) ? 'dated' : 'undated';
}

function setItems(next: ProjectSectionItem[]) {
  projectData.value.sections = orderProjectSections(next);
}

function openItem(target?: ProjectSectionItem): Promise<void> {
  return parts.edit(target, (edit) =>
    openModal(projectContentItemModal, {
      projectHumanReadableSlug: projectData.value.humanReadableSlug,
      projectPublicId: projectData.value.publicId,
      savedProject: {
        humanReadableSlug: savedProjectData.value.humanReadableSlug,
        publicId: savedProjectData.value.publicId,
      },
      item: target,
      saved: () => projectAi?.panel.value,
      onSave: (item: ProjectSectionItem) => {
        const merged = edit.take(item);
        // A section that gained or lost its dates is now in the other tab;
        // the list follows it there.
        selected.value = groupOf(merged);
        // Saves the project when this section is all that changed since
        // its last save.
        saveAfterItemEdit?.(merged, merged.sectionUuid);
      },
      stored: edit.stored,
      // The section as the modal holds it, in place of the one it was
      // opened with, against the project as last saved.
      usageDelta: (draft: ProjectSectionItem) =>
        projectAssetUsageDelta(
          { ...projectData.value, sections: edit.withDraft(draft) },
          savedProjectData.value,
        ),
    }),
  );
}
</script>

<template>
  <div>
    <SectionHeader
      :icon="entityTypeIcon('project-section')"
      :title="phrase.project_content_sections"
      :description="phrase.project_content_sections_hint"
      class="mb-md"
    >
      <template #action>
        <SectionAddButton
          :label="phrase.content_section_add"
          @click="openItem()"
        />
      </template>
    </SectionHeader>

    <Box class="flex flex-col overflow-hidden" data-sections>
      <UnderlineTabs
        v-model="selected"
        :tabs="tabs"
        :label="phrase.project_content_sections"
        controls="project-sections-list"
        class="px-xs max-sm:justify-center sm:px-sm"
      />
      <div
        id="project-sections-list"
        ref="root"
        role="tabpanel"
        :aria-labelledby="`project-sections-list-${selected}-tab`"
        :data-section-group="selected"
        class="flex flex-col gap-2 p-sm sm:p-md"
      >
        <ProjectContentItemRow
          v-for="{ item, id, media } in itemViews"
          :key="id"
          :data-drag-id="id"
          :title="item.title"
          :summary="item.summary"
          :periods="item.periods"
          :media
          :is-private="item.isPrivate"
          :sortable="selected === 'undated'"
          @open="parts.guardClick(() => openItem(item))"
          @move="parts.moveWithKeyboard(item, $event)"
        />
        <p
          v-if="!itemViews.length"
          class="text-sm text-text-3 italic"
          data-sections-empty
        >
          {{ phrase.project_sections_empty_of(selected) }}
        </p>
      </div>
    </Box>
  </div>
</template>
