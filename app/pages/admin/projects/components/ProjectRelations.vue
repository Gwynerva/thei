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

const draggingUuid = ref<string>();
const dragOverUuid = ref<string>();
const dragOverType = ref<ProjectRelationType>();
let pointerId: number | undefined;
let startX = 0;
let startY = 0;
let sourceRow: HTMLElement | undefined;
let ghost: HTMLElement | undefined;
let moved = false;

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

function onPointerDown(relation: ProjectRelationEditItem, event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (pointerId !== undefined) return;
  pointerId = event.pointerId;
  startX = event.clientX;
  startY = event.clientY;
  sourceRow =
    (event.currentTarget as HTMLElement).closest<HTMLElement>(
      '[data-relation-uuid]',
    ) ?? undefined;
  draggingUuid.value = relation.projectUuid;
  moved = false;
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', cleanupDrag);
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  if (!moved) {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (dx * dx + dy * dy <= 36) return;
    moved = true;
    event.preventDefault();
    document.body.style.userSelect = 'none';
    if (sourceRow) {
      const rect = sourceRow.getBoundingClientRect();
      ghost = sourceRow.cloneNode(true) as HTMLElement;
      Object.assign(ghost.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '9999',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        opacity: '0.86',
        boxShadow: 'var(--shadow-xl)',
      });
      document.body.append(ghost);
    }
  }
  if (!moved) return;
  event.preventDefault();
  if (ghost) {
    ghost.style.left = `${event.clientX - 24}px`;
    ghost.style.top = `${event.clientY - 24}px`;
  }
  const target = document
    .elementsFromPoint(event.clientX, event.clientY)
    .map((element) =>
      element instanceof HTMLElement
        ? element.closest<HTMLElement>('[data-relation-type]')
        : null,
    )
    .find((element) => element && relationsRoot.value?.contains(element));
  dragOverType.value = target?.dataset.relationType as
    ProjectRelationType | undefined;
  dragOverUuid.value = target?.closest<HTMLElement>('[data-relation-uuid]')
    ?.dataset.relationUuid;
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  if (moved && draggingUuid.value && dragOverType.value) {
    moveRelation(draggingUuid.value, dragOverType.value, dragOverUuid.value);
  }
  cleanupDrag();
}

function moveRelation(
  projectUuid: string,
  type: ProjectRelationType,
  targetUuid?: string,
) {
  const sourceIndex = relations.value.findIndex(
    (item) => item.projectUuid === projectUuid,
  );
  const movedRelation = relations.value[sourceIndex];
  if (!movedRelation) return;
  if (movedRelation.type === type && targetUuid === projectUuid) return;
  const targetIndex = targetUuid
    ? relations.value.findIndex((item) => item.projectUuid === targetUuid)
    : -1;
  const insertAfterTarget =
    movedRelation.type === type &&
    targetIndex >= 0 &&
    sourceIndex < targetIndex;
  const remaining = relations.value.filter(
    (item) => item.projectUuid !== projectUuid,
  );
  const targetIndices = remaining
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === type);
  const targetRemainingIndex = targetUuid
    ? remaining.findIndex((item) => item.projectUuid === targetUuid)
    : -1;
  const insertAt =
    targetRemainingIndex >= 0
      ? targetRemainingIndex + (insertAfterTarget ? 1 : 0)
      : targetIndices.length
        ? targetIndices.at(-1)!.index + 1
        : insertionIndexForGroup(remaining, type);
  remaining.splice(insertAt, 0, { ...movedRelation, type });
  replaceRelations(remaining);
}

function insertionIndexForGroup(
  items: ProjectRelationEditItem[],
  type: ProjectRelationType,
) {
  const order: ProjectRelationType[] = ['related', 'influencing', 'dependent'];
  const nextTypes = order.slice(order.indexOf(type) + 1);
  const nextIndex = items.findIndex((item) => nextTypes.includes(item.type));
  return nextIndex < 0 ? items.length : nextIndex;
}

function cleanupDrag() {
  ghost?.remove();
  ghost = undefined;
  pointerId = undefined;
  sourceRow = undefined;
  moved = false;
  draggingUuid.value = undefined;
  dragOverUuid.value = undefined;
  dragOverType.value = undefined;
  document.body.style.userSelect = '';
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.removeEventListener('pointercancel', cleanupDrag);
}

onUnmounted(cleanupDrag);
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
        <section
          v-for="(group, groupIndex) in groups"
          :key="group.type"
          :data-relation-type="group.type"
          :class="{
            'ring-2 ring-accent ring-inset':
              draggingUuid && dragOverType === group.type && !dragOverUuid,
          }"
        >
          <header
            class="border-y border-border-1 bg-bg-3 px-sm py-xs text-text-2
              sm:px-md"
            :class="{ 'border-t-0': groupIndex === 0 }"
          >
            <Icon :name="group.icon" class="mr-xs" />
            <span class="font-semibold">{{ group.title }}</span>
          </header>

          <div v-if="group.items.length" class="flex flex-col">
            <div
              v-for="relation in group.items"
              :key="relation.projectUuid"
              :data-relation-uuid="relation.projectUuid"
              :data-relation-type="group.type"
              class="border-t border-border-1 p-sm first:border-t-0 sm:p-md"
              :class="{
                'opacity-45': draggingUuid === relation.projectUuid,
                'ring-2 ring-accent ring-inset':
                  dragOverUuid === relation.projectUuid &&
                  draggingUuid !== relation.projectUuid,
              }"
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
                  class="flex size-10 shrink-0 cursor-grab touch-none
                    items-center justify-center rounded-normal bg-bg-3
                    text-text-2 transition-colors active:cursor-grabbing
                    hocus:bg-bg-accent hocus:text-accent"
                  :aria-label="`${group.title}: ${relation.title}`"
                  @pointerdown="onPointerDown(relation, $event)"
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
          </div>
          <div
            v-else
            class="flex min-h-16 items-center justify-center p-sm text-sm
              text-text-3 italic sm:p-md"
          >
            {{ phrase.project_relations_empty }}
          </div>
        </section>
      </Box>
    </div>
  </div>
</template>
