<script lang="ts" setup>
import {
  isRelationEntityType,
  relationEndpointKey,
  type RelationEditItem,
  type RelationEntityType,
  type RelationNote,
  type RelationType,
} from '#layers/thei/shared/relation';
import {
  relationEntityIcon,
  relationTypeIcon,
} from '#layers/thei/shared/relation-display';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import type { IconName } from '#thei/icons';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import ContentEntitySearchPopup from '#layers/thei/app/components/content/ContentEntitySearchPopup.vue';
import {
  createDragSort,
  moveItemToGroup,
} from '#layers/thei/app/composables/drag-sort';

/**
 * The relations block, shared by projects, events and diary entries.
 *
 * Both sides of a relation are the same kind of thing, so the editor is the
 * same too: one list per direction, drag between them to change what the
 * relation says, and a note that can be written once or once per side.
 */
const { ownerType, ownerId, ownerTitle } = defineProps<{
  ownerType: RelationEntityType;
  ownerId?: string;
  /** The entity being edited, for the "note from its side" placeholder. */
  ownerTitle: string;
}>();

const model = defineModel<RelationEditItem[]>({ required: true });

/**
 * A diary entry relates to projects and events, never to another entry: two
 * days are already ordered by the calendar, and a thought about a thought is
 * written in the entry itself.
 */
const pickableTypes = computed<RelationEntityType[]>(() =>
  ownerType === 'diary-entry'
    ? ['project', 'event']
    : ['project', 'event', 'diary-entry'],
);

const relationsRoot = useTemplateRef<HTMLElement>('relationsRoot');
const relations = computed(() => model.value ?? []);
const addRelationButton = useTemplateRef<HTMLElement>('addRelationButton');
const entitySearch =
  useTemplateRef<InstanceType<typeof ContentEntitySearchPopup>>('entitySearch');
const entitySearchOpen = ref(false);
const excludedKeys = computed(() => [
  ...(ownerId ? [relationEndpointKey({ type: ownerType, id: ownerId })] : []),
  ...relations.value.map((item) =>
    relationEndpointKey({ type: item.entityType, id: item.entityId }),
  ),
]);

function relationKey(item: RelationEditItem) {
  return relationEndpointKey({ type: item.entityType, id: item.entityId });
}

function relationHref(item: RelationEditItem) {
  if (item.date) return buildDiaryUrl(item.date);
  if (!item.publicId) return undefined;
  return item.entityType === 'project'
    ? buildProjectUrl(item.humanReadableSlug ?? '', item.publicId)
    : buildEventUrl(item.humanReadableSlug ?? '', item.publicId);
}

const groups = computed<
  Array<{
    type: RelationType;
    icon: IconName;
    title: string;
    items: RelationEditItem[];
  }>
>(() =>
  (
    [
      ['related', phrase.value.project_relations_related],
      ['influencing', phrase.value.project_relations_influencing],
      ['dependent', phrase.value.project_relations_dependent],
    ] as const
  ).map(([type, title]) => ({
    type,
    icon: relationTypeIcon(type),
    title,
    items: relations.value.filter((item) => item.type === type),
  })),
);

let relationSorters: Array<ReturnType<typeof createDragSort>> = [];

function openEntitySearch() {
  entitySearchOpen.value = true;
}

function focusEntitySearch() {
  entitySearch.value?.focus();
}

function restoreAddRelationFocus() {
  addRelationButton.value?.focus({ preventScroll: true });
}

function addRelation(entity: ContentEntitySearchItem) {
  if (!isRelationEntityType(entity.entityType)) return;
  replaceRelations([
    ...relations.value,
    {
      entityType: entity.entityType,
      entityId: entity.entityId,
      title: entity.title,
      summary: entity.summary,
      humanReadableSlug: entity.humanReadableSlug,
      publicId: entity.publicId,
      ...(entity.date ? { date: entity.date } : {}),
      iconMedia: entity.previewMedia,
      type: 'related',
    },
  ]);
  entitySearchOpen.value = false;
}

function removeRelation(key: string) {
  replaceRelations(relations.value.filter((item) => relationKey(item) !== key));
}

function replaceRelations(value: RelationEditItem[]) {
  model.value = value;
}

function updateNote(key: string, note: RelationNote) {
  replaceRelations(
    relations.value.map((item) =>
      relationKey(item) === key ? { ...item, note } : item,
    ),
  );
}

function updateSharedNote(key: string, text: string) {
  updateNote(key, { type: 'shared', text });
}

function updateSplitNote(
  key: string,
  side: 'currentText' | 'relatedText',
  text: string,
) {
  const relation = relations.value.find((item) => relationKey(item) === key);
  const note =
    relation?.note?.type === 'split'
      ? relation.note
      : { type: 'split' as const };
  updateNote(key, { ...note, [side]: text });
}

function toggleSplitNote(relation: RelationEditItem) {
  const note = relation.note;
  const key = relationKey(relation);
  if (note?.type === 'split') {
    const current = note.currentText ?? '';
    const related = note.relatedText ?? '';
    const text =
      current === related
        ? current
        : !current
          ? related
          : !related
            ? current
            : `${current} — ${related}`;
    updateNote(key, { type: 'shared', text });
    return;
  }
  const text = note?.text ?? '';
  updateNote(key, { type: 'split', currentText: text, relatedText: text });
}

function moveRelation(key: string, type: RelationType, newIndex: number) {
  const order: RelationType[] = ['related', 'influencing', 'dependent'];
  replaceRelations(
    moveItemToGroup(
      relations.value,
      key,
      type,
      newIndex,
      order,
      relationKey,
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
      group: 'entity-relations',
      handle: '[data-relation-handle]',
      onDrop: ({ id, to, newIndex }) => {
        const type = to.dataset.relationList as RelationType | undefined;
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
        :title="phrase.related_entities"
        :description="phrase.related_entities_hint"
        class="flex-1"
      />
      <button
        ref="addRelationButton"
        type="button"
        class="size-12 shrink-0 cursor-pointer rounded-normal bg-bg-3
          text-text-2 transition-colors hocus:bg-bg-accent hocus:text-accent"
        :aria-label="phrase.related_entity_add"
        :data-title-popup="phrase.related_entity_add"
        :aria-expanded="entitySearchOpen"
        aria-haspopup="dialog"
        @click="openEntitySearch"
      >
        <Icon name="plus" />
      </button>
    </div>

    <FloatingPopup
      v-model:open="entitySearchOpen"
      :anchor="addRelationButton"
      placement="bottom-end"
      @opened="focusEntitySearch"
      @closed="restoreAddRelationFocus"
    >
      <ContentEntitySearchPopup
        ref="entitySearch"
        :entity-types="pickableTypes"
        :exclude="excludedKeys"
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
              :key="relationKey(relation)"
              :data-drag-id="relationKey(relation)"
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
                  <Icon
                    v-else
                    :name="relationEntityIcon(relation.entityType)"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-semibold">
                    {{
                      relation.date
                        ? entityDisplayTitle({
                            title: relation.title ?? '',
                            date: relation.date,
                          })
                        : relation.title || relation.entityId
                    }}
                  </div>
                  <div
                    class="flex min-w-0 items-center gap-1 text-xs text-text-3"
                  >
                    <NuxtLink
                      v-if="relation.humanReadableSlug && relation.publicId"
                      :to="relationHref(relation)"
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
                      v-if="relation.date"
                      :to="relationHref(relation)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="truncate rounded-sm transition hocus:text-accent
                        hocus:underline"
                    >
                      {{ relationHref(relation) }}
                    </NuxtLink>
                    <NuxtLink
                      v-else-if="relation.publicId"
                      :to="relationHref(relation)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="max-w-1/2 truncate rounded-sm transition
                        hocus:text-accent hocus:underline"
                    >
                      {{ relation.publicId }}
                    </NuxtLink>
                    <span v-else class="truncate">{{ relation.entityId }}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon-lg"
                  variant="secondary"
                  drag-handle
                  :aria-label="`${group.title}: ${relation.title}`"
                  data-relation-handle
                >
                  <Icon name="grip" />
                </Button>
                <Button
                  type="button"
                  size="icon-lg"
                  variant="delete"
                  :aria-label="phrase.delete_project_relation"
                  :data-title-popup="phrase.delete_project_relation"
                  @click="removeRelation(relationKey(relation))"
                >
                  <Icon name="delete" />
                </Button>
              </div>
              <div class="mt-xs flex items-start gap-xs">
                <div
                  v-if="relation.note?.type === 'split'"
                  class="grid min-w-0 flex-1 gap-xs sm:grid-cols-2"
                >
                  <FieldInput
                    :model-value="relation.note.currentText ?? ''"
                    type="text"
                    autocomplete="off"
                    spellcheck="true"
                    :placeholder="phrase.project_relation_note_for(ownerTitle)"
                    :data-title-popup="
                      phrase.project_relation_note_for(ownerTitle)
                    "
                    wrapper-class="min-w-0 w-full"
                    class="w-full min-w-0 text-sm"
                    @update:model-value="
                      updateSplitNote(
                        relationKey(relation),
                        'currentText',
                        String($event ?? ''),
                      )
                    "
                  />
                  <FieldInput
                    :model-value="relation.note.relatedText ?? ''"
                    type="text"
                    autocomplete="off"
                    spellcheck="true"
                    :placeholder="
                      phrase.project_relation_note_for(
                        relation.title || relation.entityId,
                      )
                    "
                    :data-title-popup="
                      phrase.project_relation_note_for(
                        relation.title || relation.entityId,
                      )
                    "
                    wrapper-class="min-w-0 w-full"
                    class="w-full min-w-0 text-sm"
                    @update:model-value="
                      updateSplitNote(
                        relationKey(relation),
                        'relatedText',
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
                  spellcheck="true"
                  :placeholder="phrase.project_relation_note_placeholder"
                  wrapper-class="min-w-0 flex-1"
                  class="w-full min-w-0 text-sm"
                  @update:model-value="
                    updateSharedNote(
                      relationKey(relation),
                      String($event ?? ''),
                    )
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
