<script lang="ts" setup>
import {
  isRelationEntityType,
  RELATION_ENTITY_TYPES,
  relationEndpointKey,
  type RelationEditItem,
  type RelationEndpoint,
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
import type { TabStripItem } from '#layers/thei/app/components/TabStrip.vue';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import ContentEntitySearchPopup from '#layers/thei/app/components/content/ContentEntitySearchPopup.vue';
import {
  createDragSort,
  moveItemById,
} from '#layers/thei/app/composables/drag-sort';

/**
 * The relations block of a project, an event or a diary entry.
 *
 * Any of the three draws relations to any of the three, and the other end
 * lists the relation from its side without editing it here. One tab per
 * kind of thing on the other end, each row says what the relation is with a
 * three-way toggle, and carries a note written once or once per side.
 * Projects and events are ordered by hand; diary entries are days, so they
 * keep the order of their days. A long group scrolls inside itself rather
 * than stretching the form.
 */
const { owner, ownerTitle } = defineProps<{
  /** The entity being edited, kept out of the picker; absent until created. */
  owner?: RelationEndpoint;
  /** What the entity is called, for the "note from its side" placeholder. */
  ownerTitle: string;
}>();

const model = defineModel<RelationEditItem[]>({ required: true });

const relationsRoot = useTemplateRef<HTMLElement>('relationsRoot');
const relations = computed(() => model.value ?? []);
const addRelationButton = useTemplateRef<HTMLElement>('addRelationButton');
const entitySearch =
  useTemplateRef<InstanceType<typeof ContentEntitySearchPopup>>('entitySearch');
const entitySearchOpen = ref(false);
const excludedKeys = computed(() => [
  ...(owner ? [relationEndpointKey(owner)] : []),
  ...relations.value.map(relationKey),
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

function relationTitle(item: RelationEditItem) {
  return item.date
    ? entityDisplayTitle({ title: item.title ?? '', date: item.date })
    : item.title || item.entityId;
}

/** Diary entries are listed by their day, newest first, wherever they go. */
function byDay(items: RelationEditItem[]) {
  return [...items].sort((left, right) =>
    (right.date ?? '').localeCompare(left.date ?? ''),
  );
}

function ofKind(items: RelationEditItem[], type: RelationEntityType) {
  const kind = items.filter((item) => item.entityType === type);
  return type === 'diary-entry' ? byDay(kind) : kind;
}

type Group = {
  type: RelationEntityType;
  icon: IconName;
  title: string;
  items: RelationEditItem[];
  /** Whether the rows are ordered by hand rather than by their days. */
  sortable: boolean;
};

const kindTitles = computed<Record<RelationEntityType, string>>(() => ({
  project: phrase.value.projects,
  event: phrase.value.events,
  'diary-entry': phrase.value.diary,
}));

const groups = computed<Group[]>(() =>
  RELATION_ENTITY_TYPES.map((type) => ({
    type,
    icon: relationEntityIcon(type),
    title: kindTitles.value[type],
    items: ofKind(relations.value, type),
    sortable: type !== 'diary-entry',
  })).filter((group) => group.items.length > 0),
);

/** The kind on show: the first that has any, until one is chosen. */
const selected = ref<RelationEntityType>('project');
watch(
  groups,
  (list) => {
    if (!list.some((group) => group.type === selected.value))
      selected.value = list[0]?.type ?? 'project';
  },
  { immediate: true },
);
const activeGroup = computed(() =>
  groups.value.find((group) => group.type === selected.value),
);
const tabs = computed<TabStripItem<RelationEntityType>[]>(() =>
  groups.value.map((group) => ({
    key: group.type,
    label: group.title,
    icon: group.icon,
    count: group.items.length,
  })),
);

const directions = computed(() =>
  (['related', 'influencing', 'dependent'] as const).map((type) => ({
    type,
    icon: relationTypeIcon(type),
  })),
);

/**
 * What a direction means for this very pair, with both names in it: "A
 * depends on B" reads at once, where "Depends on" alone still asks which
 * side is which.
 */
function directionTitle(relation: RelationEditItem, type: RelationType) {
  const other = relationTitle(relation);
  if (type === 'influencing')
    return phrase.value.relation_popup_depends_on(ownerTitle, other);
  if (type === 'dependent')
    return phrase.value.relation_popup_affects(ownerTitle, other);
  return phrase.value.relation_popup_related(ownerTitle, other);
}

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
  // Show the tab the new row landed in, or it would be added out of sight.
  selected.value = entity.entityType;
  entitySearchOpen.value = false;
}

function removeRelation(key: string) {
  replaceRelations(relations.value.filter((item) => relationKey(item) !== key));
}

/**
 * The list is kept in the order it is shown: one kind after another, and the
 * diary entries by their days. That order is what the other side sees too.
 */
function replaceRelations(value: RelationEditItem[]) {
  model.value = RELATION_ENTITY_TYPES.flatMap((type) => ofKind(value, type));
}

function updateRelation(
  key: string,
  patch: (item: RelationEditItem) => RelationEditItem,
) {
  replaceRelations(
    relations.value.map((item) =>
      relationKey(item) === key ? patch(item) : item,
    ),
  );
}

function setType(key: string, type: RelationType) {
  updateRelation(key, (item) =>
    item.type === type ? item : { ...item, type },
  );
}

function updateNote(key: string, note: RelationNote) {
  updateRelation(key, (item) => ({ ...item, note }));
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

function moveRelation(type: RelationEntityType, key: string, newIndex: number) {
  const moved = moveItemById(
    ofKind(relations.value, type),
    key,
    newIndex,
    relationKey,
  );
  replaceRelations(
    RELATION_ENTITY_TYPES.flatMap((kind) =>
      kind === type ? moved : ofKind(relations.value, kind),
    ),
  );
}

/**
 * One sorter for the hand-ordered list on show. The list is swapped with the
 * tab, so the sorter is rebuilt whenever the tab changes.
 */
let relationSorters: Array<ReturnType<typeof createDragSort>> = [];

function cleanupSorters() {
  relationSorters.forEach((sorter) => sorter.destroy());
  relationSorters = [];
}

function buildSorters() {
  cleanupSorters();
  relationSorters = Array.from(
    relationsRoot.value?.querySelectorAll<HTMLElement>(
      '[data-relation-list]',
    ) ?? [],
  ).map((root) =>
    createDragSort(root, {
      handle: '[data-relation-handle]',
      onDrop: ({ id, to, newIndex }) => {
        const type = to.dataset.relationList;
        if (isRelationEntityType(type)) moveRelation(type, id, newIndex);
      },
    }),
  );
}

onMounted(() => {
  watch(() => activeGroup.value?.type, buildSorters, {
    immediate: true,
    flush: 'post',
  });
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
        :entity-types="['project', 'event', 'diary-entry']"
        :exclude="excludedKeys"
        @select="addRelation"
      />
    </FloatingPopup>

    <TabStrip
      v-if="groups.length"
      v-model="selected"
      :tabs="tabs"
      :label="phrase.related_entities"
      class="mb-sm"
    />
    <div ref="relationsRoot">
      <Box class="flex flex-col overflow-hidden">
        <div
          v-if="!activeGroup"
          class="flex min-h-16 items-center p-sm text-sm text-text-3 italic
            sm:p-md"
        >
          {{ phrase.relations_empty }}
        </div>
        <div
          v-else
          :key="activeGroup.type"
          :data-relation-list="
            activeGroup.sortable ? activeGroup.type : undefined
          "
          class="flex scrollbar-mini max-h-120 flex-col overflow-y-auto
            overscroll-contain"
        >
          <div
            v-for="relation in activeGroup.items"
            :key="relationKey(relation)"
            :data-drag-id="
              activeGroup.sortable ? relationKey(relation) : undefined
            "
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
                <Icon v-else :name="relationEntityIcon(relation.entityType)" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate font-semibold">
                  {{ relationTitle(relation) }}
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
                v-if="activeGroup.sortable"
                type="button"
                size="icon-lg"
                variant="secondary"
                drag-handle
                :aria-label="`${activeGroup.title}: ${relationTitle(relation)}`"
                data-relation-handle
              >
                <Icon name="grip" />
              </Button>
              <Button
                type="button"
                size="icon-lg"
                variant="delete"
                :aria-label="phrase.delete_relation"
                :data-title-popup="phrase.delete_relation"
                @click="removeRelation(relationKey(relation))"
              >
                <Icon name="delete" />
              </Button>
            </div>
            <div class="mt-xs flex items-start gap-xs">
              <!-- What the relation is, from this entity's side: the
                     filled end of every icon is this entity. -->
              <div
                role="radiogroup"
                :aria-label="phrase.relation_direction"
                class="flex shrink-0 gap-0.5 rounded-normal bg-bg-3 p-0.5"
              >
                <button
                  v-for="direction in directions"
                  :key="direction.type"
                  type="button"
                  role="radio"
                  :aria-checked="relation.type === direction.type"
                  :aria-label="directionTitle(relation, direction.type)"
                  :data-title-popup="directionTitle(relation, direction.type)"
                  class="flex size-10 cursor-pointer items-center justify-center
                    rounded-sm text-2xl transition-colors"
                  :class="
                    relation.type === direction.type
                      ? 'bg-bg-1 text-accent shadow-sm'
                      : 'text-text-3 hocus:bg-bg-1/60 hocus:text-text-1'
                  "
                  @click="setType(relationKey(relation), direction.type)"
                >
                  <Icon :name="direction.icon" />
                </button>
              </div>
              <div
                v-if="relation.note?.type === 'split'"
                class="grid min-w-0 flex-1 gap-xs sm:grid-cols-2"
              >
                <FieldInput
                  :model-value="relation.note.currentText ?? ''"
                  type="text"
                  autocomplete="off"
                  spellcheck="true"
                  :placeholder="phrase.relation_note_for(ownerTitle)"
                  :data-title-popup="phrase.relation_note_for(ownerTitle)"
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
                    phrase.relation_note_for(relationTitle(relation))
                  "
                  :data-title-popup="
                    phrase.relation_note_for(relationTitle(relation))
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
                :placeholder="phrase.relation_note_placeholder"
                wrapper-class="min-w-0 flex-1"
                class="w-full min-w-0 text-sm"
                @update:model-value="
                  updateSharedNote(relationKey(relation), String($event ?? ''))
                "
              />
              <button
                type="button"
                class="flex size-10 shrink-0 cursor-pointer items-center
                  justify-center rounded-normal bg-bg-3 text-text-2
                  transition-colors hocus:bg-bg-accent hocus:text-accent"
                :aria-label="
                  relation.note?.type === 'split'
                    ? phrase.merge_relation_note
                    : phrase.split_relation_note
                "
                :data-title-popup="
                  relation.note?.type === 'split'
                    ? phrase.merge_relation_note
                    : phrase.split_relation_note
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
      </Box>
    </div>
  </div>
</template>
