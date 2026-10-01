<script lang="ts" setup>
import {
  isRelationEntityType,
  orderRelationsForEditing,
  RELATION_ENTITY_TYPES,
  RELATION_TYPES,
  relationEndpointKey,
  type RelationEditItem,
  type RelationEndpoint,
  type RelationEntityType,
  type RelationNote,
  type RelationType,
} from '#layers/thei/shared/relation';
import {
  relationEntityIcon,
  relationShortLabel,
} from '#layers/thei/shared/relation-display';
import {
  CONTENT_ENTITY_SEARCH_MAX_LIMIT,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import type { ContentOutputData } from '#layers/thei/shared/content';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { contentEntityMentions } from '#layers/thei/shared/public-content-reference';
import type { IconName } from '#thei/icons';
import type { TabStripItem } from '#layers/thei/app/components/TabStrip.vue';
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
 * kind of thing on the other end, each relation a row of its own
 * (`AdminRelationRow`). Projects and events are ordered by hand; diary
 * entries are days, so they keep the order of their days. A long group
 * scrolls inside itself rather than stretching the form.
 *
 * The picker of a new relation offers first what the entity's own text
 * already links to.
 */
const { owner, ownerType, ownerTitle, ownerMedia, text } = defineProps<{
  /** The entity being edited, kept out of the picker; absent until created. */
  owner?: RelationEndpoint;
  ownerType: RelationEntityType;
  /** What the entity is called, for its hint and its side's note. */
  ownerTitle: string;
  /** Its picture, if it has one of its own yet; its kind's glyph otherwise. */
  ownerMedia?: MediaDescriptor;
  /** Its text as it is being edited, whose links the picker offers first. */
  text?: ContentOutputData | null;
}>();

const model = defineModel<RelationEditItem[]>({ required: true });

const relationsRoot = useTemplateRef<HTMLElement>('relationsRoot');
const relations = computed(() => model.value ?? []);
const addRelationButton = useTemplateRef('addRelationButton');
const entitySearch =
  useTemplateRef<InstanceType<typeof ContentEntitySearchPopup>>('entitySearch');
const entitySearchOpen = ref(false);
const excludedKeys = computed(() => [
  ...(owner ? [relationEndpointKey(owner)] : []),
  ...relations.value.map(relationKey),
]);

/** What the text links to and is not related yet, in the text's order. */
const mentionedKeys = computed(() => {
  const excluded = new Set(excludedKeys.value);
  return contentEntityMentions(text)
    .filter((mention) => isRelationEntityType(mention.entityType))
    .map((mention) => `${mention.entityType}:${mention.entityId}`)
    .filter((key) => !excluded.has(key))
    .slice(0, CONTENT_ENTITY_SEARCH_MAX_LIMIT);
});

const ownerName = computed(() => publicText(ownerTitle));

function relationKey(item: RelationEditItem) {
  return relationEndpointKey({ type: item.entityType, id: item.entityId });
}

/**
 * The relations to one kind of entity. The list is kept in the order it is
 * shown (`replaceRelations`), so a kind's rows are already in theirs.
 */
function ofKind(items: RelationEditItem[], type: RelationEntityType) {
  return items.filter((item) => item.entityType === type);
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

/** The kinds a relation can be, with their words, as the list offers them. */
const directions = computed(() =>
  RELATION_TYPES.map((type) => ({
    type,
    label: relationShortLabel(phrase.value, type, ownerType),
  })),
);

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
 * The list is kept in the order it is shown, which is the order the edit API
 * reads it out in (`orderRelationsForEditing`): a change and its undoing
 * leave the form as it was loaded.
 */
function replaceRelations(value: RelationEditItem[]) {
  model.value = orderRelationsForEditing(value);
}

/**
 * Changes one relation in place. Neither its kind nor its note moves it, so
 * the list keeps its order, and every other row keeps the very item it drew.
 */
function updateRelation(
  key: string,
  patch: (item: RelationEditItem) => RelationEditItem,
) {
  model.value = relations.value.map((item) =>
    relationKey(item) === key ? patch(item) : item,
  );
}

function setType(key: string, type: RelationType) {
  updateRelation(key, (item) => ({ ...item, type }));
}

function updateNote(key: string, note: RelationNote) {
  updateRelation(key, (item) => ({ ...item, note }));
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
    <SectionHeader
      icon="arrow-cycle"
      :title="phrase.related_entities"
      :description="phrase.related_entities_hint"
      class="mb-md"
    >
      <template #action>
        <SectionAddButton
          ref="addRelationButton"
          :label="phrase.related_entity_add"
          :expanded="entitySearchOpen"
          @click="openEntitySearch"
        />
      </template>
    </SectionHeader>

    <FloatingPopup
      v-model:open="entitySearchOpen"
      :anchor="addRelationButton?.element ?? null"
      placement="bottom-end"
      @opened="focusEntitySearch"
      @closed="restoreAddRelationFocus"
    >
      <ContentEntitySearchPopup
        ref="entitySearch"
        :entity-types="['project', 'event', 'diary-entry']"
        :exclude="excludedKeys"
        :prefer="mentionedKeys"
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
          <AdminRelationRow
            v-for="relation in activeGroup.items"
            :key="relationKey(relation)"
            :data-drag-id="
              activeGroup.sortable ? relationKey(relation) : undefined
            "
            data-relation-row
            :relation
            :owner-type="ownerType"
            :owner-name="ownerName"
            :owner-media="ownerMedia"
            :directions
            :sortable="activeGroup.sortable"
            :group-title="activeGroup.title"
            @type="setType(relationKey(relation), $event)"
            @note="updateNote(relationKey(relation), $event)"
            @remove="removeRelation(relationKey(relation))"
          />
        </div>
      </Box>
    </div>
  </div>
</template>
