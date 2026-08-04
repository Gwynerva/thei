<script lang="ts" setup>
import type {
  ProjectRelationEditItem,
  ProjectRelationNote,
  ProjectRelationType,
} from '#layers/thei/shared/admin/project';
import type { ProjectSearchItem } from '#layers/thei/shared/api/project';
import type { IconName } from '#thei/icons';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { currentProjectUuidKey, projectDataInjectionKey } from '../composables';
import ProjectSearchPopup from '#layers/thei/app/components/ProjectSearchPopup.vue';
import {
  createDragSort,
  moveItemToGroup,
} from '#layers/thei/app/composables/drag-sort';

const projectData = inject(projectDataInjectionKey)!;
const currentProjectUuid = inject(currentProjectUuidKey)!;
const relationsRoot = useTemplateRef<HTMLElement>('relationsRoot');
const relations = computed(() => projectData.value.relations ?? []);
const currentProjectTitle = computed(
  () => projectData.value.title.trim() || phrase.value.new_project,
);
const addRelationButton = useTemplateRef<HTMLElement>('addRelationButton');
const projectSearch =
  useTemplateRef<InstanceType<typeof ProjectSearchPopup>>('projectSearch');
const projectSearchOpen = ref(false);
const excludedProjectUuids = computed(() => [
  ...(currentProjectUuid.value ? [currentProjectUuid.value] : []),
  ...relations.value.map((item) => item.projectUuid),
]);

const groups = computed<
  Array<{
    type: ProjectRelationType;
    icon: IconName;
    title: string;
    items: ProjectRelationEditItem[];
  }>
>(() => [
  {
    type: 'related',
    icon: 'project-connection',
    title: phrase.value.project_relations_related,
    items: relations.value.filter((item) => item.type === 'related'),
  },
  {
    type: 'influencing',
    icon: 'project-dependency',
    title: phrase.value.project_relations_influencing,
    items: relations.value.filter((item) => item.type === 'influencing'),
  },
  {
    type: 'dependent',
    icon: 'project-dependent',
    title: phrase.value.project_relations_dependent,
    items: relations.value.filter((item) => item.type === 'dependent'),
  },
]);

let relationSorters: Array<ReturnType<typeof createDragSort>> = [];

function openProjectSearch() {
  projectSearchOpen.value = true;
}

function focusProjectSearch() {
  projectSearch.value?.focus();
}

function restoreAddRelationFocus() {
  addRelationButton.value?.focus({ preventScroll: true });
}

function addRelation(project: ProjectSearchItem) {
  replaceRelations([...relations.value, { ...project, type: 'related' }]);
  projectSearchOpen.value = false;
}

function removeRelation(projectUuid: string) {
  replaceRelations(
    relations.value.filter((item) => item.projectUuid !== projectUuid),
  );
}

function replaceRelations(value: ProjectRelationEditItem[]) {
  projectData.value.relations = value;
}

function updateNote(projectUuid: string, note: ProjectRelationNote) {
  replaceRelations(
    relations.value.map((item) =>
      item.projectUuid === projectUuid ? { ...item, note } : item,
    ),
  );
}

function updateSharedNote(projectUuid: string, text: string) {
  updateNote(projectUuid, { type: 'shared', text });
}

function updateSplitNote(
  projectUuid: string,
  side: 'currentProjectText' | 'relatedProjectText',
  text: string,
) {
  const relation = relations.value.find(
    (item) => item.projectUuid === projectUuid,
  );
  const note =
    relation?.note?.type === 'split'
      ? relation.note
      : { type: 'split' as const };
  updateNote(projectUuid, { ...note, [side]: text });
}

function toggleSplitNote(relation: ProjectRelationEditItem) {
  const note = relation.note;
  if (note?.type === 'split') {
    const current = note.currentProjectText ?? '';
    const related = note.relatedProjectText ?? '';
    const text =
      current === related
        ? current
        : !current
          ? related
          : !related
            ? current
            : `${current} — ${related}`;
    updateNote(relation.projectUuid, { type: 'shared', text });
    return;
  }
  const text = note?.text ?? '';
  updateNote(relation.projectUuid, {
    type: 'split',
    currentProjectText: text,
    relatedProjectText: text,
  });
}

function moveRelation(
  projectUuid: string,
  type: ProjectRelationType,
  newIndex: number,
) {
  const order: ProjectRelationType[] = ['related', 'influencing', 'dependent'];
  replaceRelations(
    moveItemToGroup(
      relations.value,
      projectUuid,
      type,
      newIndex,
      order,
      (item) => item.projectUuid,
      (item) => item.type,
      (item, nextType) => ({ ...item, type: nextType }),
    ),
  );
}

function cleanupSorters() {
  relationSorters.forEach((sorter) => sorter.destroy());
  relationSorters = [];
}

onMounted(() => {
  relationSorters = Array.from(
    relationsRoot.value?.querySelectorAll<HTMLElement>(
      '[data-relation-list]',
    ) ?? [],
  ).map((root) =>
    createDragSort(root, {
      group: 'project-relations',
      handle: '[data-relation-handle]',
      onDrop: ({ id, to, newIndex }) => {
        const type = to.dataset.relationList as ProjectRelationType | undefined;
        if (type) moveRelation(id, type, newIndex);
      },
    }),
  );
});

onUnmounted(cleanupSorters);
</script>

<template>
  <div>
    <div class="mb-md flex items-center gap-md">
      <SectionHeader
        icon="arrow-cycle"
        :title="phrase.project_relations"
        :description="phrase.project_relations_hint"
        class="flex-1"
      />
      <button
        ref="addRelationButton"
        type="button"
        class="size-12 shrink-0 cursor-pointer rounded-normal bg-bg-3
          text-text-2 transition-colors hocus:bg-bg-accent hocus:text-accent"
        :aria-label="phrase.add_project_relation"
        :data-title-popup="phrase.add_project_relation"
        :aria-expanded="projectSearchOpen"
        aria-haspopup="dialog"
        @click="openProjectSearch"
      >
        <Icon name="plus" />
      </button>
    </div>

    <FloatingPopup
      v-model:open="projectSearchOpen"
      :anchor="addRelationButton"
      placement="bottom-end"
      @opened="focusProjectSearch"
      @closed="restoreAddRelationFocus"
    >
      <ProjectSearchPopup
        ref="projectSearch"
        :exclude-project-uuids="excludedProjectUuids"
        @select="addRelation"
      />
    </FloatingPopup>

    <div ref="relationsRoot">
      <Box class="flex flex-col overflow-hidden">
        <section v-for="(group, groupIndex) in groups" :key="group.type">
          <header
            class="border-y border-border-1 bg-bg-3 px-sm py-xs text-text-2
              sm:px-md"
            :class="{ 'border-t-0': groupIndex === 0 }"
          >
            <Icon :name="group.icon" class="mr-xs" />
            <span class="font-semibold">{{ group.title }}</span>
          </header>

          <div :data-relation-list="group.type" class="flex min-h-16 flex-col">
            <div
              v-for="relation in group.items"
              :key="relation.projectUuid"
              :data-drag-id="relation.projectUuid"
              class="border-t border-border-1 p-sm first:border-t-0 sm:p-md"
            >
              <div class="flex min-w-0 items-center gap-xs">
                <div
                  class="flex size-10 shrink-0 items-center justify-center
                    overflow-hidden rounded-normal text-text-3"
                >
                  <Media
                    v-if="relation.iconMedia"
                    v-bind="relation.iconMedia"
                    class="size-full object-cover"
                  />
                  <Icon v-else name="project" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-semibold">
                    {{ relation.title || relation.projectUuid }}
                  </div>
                  <div
                    class="flex min-w-0 items-center gap-1 text-xs text-text-3"
                  >
                    <NuxtLink
                      v-if="relation.humanReadableSlug && relation.publicId"
                      :to="
                        buildProjectUrl(
                          relation.humanReadableSlug ?? '',
                          relation.publicId,
                        )
                      "
                      target="_blank"
                      rel="noopener noreferrer"
                      class="max-w-1/2 truncate rounded-sm transition
                        hocus:text-accent hocus:underline"
                    >
                      {{ relation.humanReadableSlug }}
                    </NuxtLink>
                    <span
                      v-if="relation.humanReadableSlug && relation.publicId"
                      aria-hidden="true"
                      >·</span
                    >
                    <NuxtLink
                      v-if="relation.publicId"
                      :to="
                        buildProjectUrl(
                          relation.humanReadableSlug ?? '',
                          relation.publicId,
                        )
                      "
                      target="_blank"
                      rel="noopener noreferrer"
                      class="max-w-1/2 truncate rounded-sm transition
                        hocus:text-accent hocus:underline"
                    >
                      {{ relation.publicId }}
                    </NuxtLink>
                    <span v-else class="truncate">{{
                      relation.projectUuid
                    }}</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="flex size-10 shrink-0 cursor-grab items-center
                    justify-center rounded-normal bg-bg-3 text-text-2
                    transition-colors active:cursor-grabbing hocus:bg-bg-accent
                    hocus:text-accent"
                  :aria-label="`${group.title}: ${relation.title}`"
                  data-relation-handle
                >
                  <Icon name="grip" />
                </button>
                <button
                  type="button"
                  class="flex size-10 shrink-0 cursor-pointer items-center
                    justify-center rounded-normal bg-bg-3 text-text-2
                    transition-colors hocus:bg-bg-error hocus:text-text-error"
                  :aria-label="phrase.delete_project_relation"
                  :data-title-popup="phrase.delete_project_relation"
                  @click="removeRelation(relation.projectUuid)"
                >
                  <Icon name="delete" />
                </button>
              </div>
              <div class="mt-xs flex items-start gap-xs">
                <div
                  v-if="relation.note?.type === 'split'"
                  class="grid min-w-0 flex-1 gap-xs sm:grid-cols-2"
                >
                  <FieldInput
                    :model-value="relation.note.currentProjectText ?? ''"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="
                      phrase.project_relation_note_for(currentProjectTitle)
                    "
                    :data-title-popup="
                      phrase.project_relation_note_for(currentProjectTitle)
                    "
                    wrapper-class="min-w-0 w-full"
                    class="w-full min-w-0 text-sm"
                    @update:model-value="
                      updateSplitNote(
                        relation.projectUuid,
                        'currentProjectText',
                        String($event ?? ''),
                      )
                    "
                  />
                  <FieldInput
                    :model-value="relation.note.relatedProjectText ?? ''"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="
                      phrase.project_relation_note_for(
                        relation.title || relation.projectUuid,
                      )
                    "
                    :data-title-popup="
                      phrase.project_relation_note_for(
                        relation.title || relation.projectUuid,
                      )
                    "
                    wrapper-class="min-w-0 w-full"
                    class="w-full min-w-0 text-sm"
                    @update:model-value="
                      updateSplitNote(
                        relation.projectUuid,
                        'relatedProjectText',
                        String($event ?? ''),
                      )
                    "
                  />
                </div>
                <FieldInput
                  v-else
                  :model-value="
                    relation.note?.type === 'shared'
                      ? (relation.note.text ?? '')
                      : ''
                  "
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  :placeholder="phrase.project_relation_note_placeholder"
                  wrapper-class="min-w-0 flex-1"
                  class="w-full min-w-0 text-sm"
                  @update:model-value="
                    updateSharedNote(relation.projectUuid, String($event ?? ''))
                  "
                />
                <button
                  type="button"
                  class="flex size-10 shrink-0 cursor-pointer items-center
                    justify-center rounded-normal bg-bg-3 text-text-2
                    transition-colors hocus:bg-bg-accent hocus:text-accent"
                  :aria-label="
                    relation.note?.type === 'split'
                      ? phrase.merge_project_relation_note
                      : phrase.split_project_relation_note
                  "
                  :data-title-popup="
                    relation.note?.type === 'split'
                      ? phrase.merge_project_relation_note
                      : phrase.split_project_relation_note
                  "
                  @click="toggleSplitNote(relation)"
                >
                  <Icon
                    :name="
                      relation.note?.type === 'split' ? 'link' : 'link-broken'
                    "
                  />
                </button>
              </div>
            </div>
            <div
              v-if="!group.items.length"
              class="flex min-h-16 items-center p-sm text-sm text-text-3 italic
                sm:p-md"
            >
              {{ phrase.project_relations_empty }}
            </div>
          </div>
        </section>
      </Box>
    </div>
  </div>
</template>
