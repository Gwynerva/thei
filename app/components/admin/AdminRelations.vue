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
import {
  CONTENT_ENTITY_SEARCH_MAX_LIMIT,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import type { ContentOutputData } from '#layers/thei/shared/content';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { contentEntityMentions } from '#layers/thei/shared/public-content-reference';
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
 * kind of thing on the other end. Each row reads as what it says — this
 * entity, what the relation is, the other one — as two pictures with a
 * three-way toggle between them, the chosen way put into words; the names
 * are in the pictures' hints, so the whole width below is left to the note,
 * written once or once per side. Projects and events are ordered by hand;
 * diary entries are days, so they keep the order of their days. A long
 * group scrolls inside itself rather than stretching the form.
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

function relationHref(item: RelationEditItem) {
  if (item.date) return buildDiaryUrl(item.date);
  if (!item.publicId) return undefined;
  return item.entityType === 'project'
    ? buildProjectUrl(item.humanReadableSlug ?? '', item.publicId)
    : buildEventUrl(item.humanReadableSlug ?? '', item.publicId);
}

function relationTitle(item: RelationEditItem) {
  if (item.date)
    return publicText(
      entityDisplayTitle({ title: item.title ?? '', date: item.date }),
    );
  return item.title ? publicText(item.title) : item.entityId;
}

/** The other end's name, and what it is about, for its picture's hint. */
function relationPopup(item: RelationEditItem) {
  return titlePopup(
    { text: relationTitle(item), bold: true },
    item.summary && {
      text: publicText(item.summary),
      italic: Boolean(item.date),
      clamp: true,
    },
  );
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
    label:
      type === 'influencing'
        ? phrase.value.relation_short_depends_on
        : type === 'dependent'
          ? phrase.value.relation_short_affects
          : phrase.value.relation_short_related(ownerType),
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
    return phrase.value.relation_popup_depends_on(ownerName.value, other);
  if (type === 'dependent')
    return phrase.value.relation_popup_affects(ownerName.value, other);
  return phrase.value.relation_popup_related(ownerName.value, other);
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

/**
 * A note is one paragraph that wraps in its field: a line break pasted into
 * it becomes a space, as it would in a single-line field.
 */
function noteText(value: unknown) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ');
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
          <div
            v-for="relation in activeGroup.items"
            :key="relationKey(relation)"
            :data-drag-id="
              activeGroup.sortable ? relationKey(relation) : undefined
            "
            class="border-t border-border-1 p-sm first:border-t-0 sm:p-md"
            data-relation-row
          >
            <!-- What the relation says, as it reads: this entity, the
                 relation, the other one. The filled end of every relation
                 icon is this entity; the chosen one is put into words. -->
            <div class="flex min-w-0 items-center gap-0.5 sm:gap-1.5">
              <button
                v-if="activeGroup.sortable"
                type="button"
                class="flex h-8 w-4 shrink-0 cursor-grab items-center
                  justify-center rounded-sm text-text-3 transition-colors
                  active:cursor-grabbing sm:w-5 hocus:bg-bg-3 hocus:text-text-1"
                :aria-label="`${activeGroup.title}: ${relationTitle(relation)}`"
                data-relation-handle
              >
                <Icon name="grip" />
              </button>
              <span
                role="img"
                :aria-label="ownerName"
                v-bind="titlePopup(ownerName)"
                class="flex size-7 shrink-0 items-center justify-center
                  overflow-hidden rounded-sm bg-bg-3 text-text-2 sm:size-8"
                data-relation-owner
              >
                <Media
                  v-if="ownerMedia"
                  v-bind="ownerMedia"
                  class="size-full object-cover"
                />
                <Icon v-else :name="relationEntityIcon(ownerType)" />
              </span>
              <div
                role="radiogroup"
                :aria-label="phrase.relation_direction"
                class="flex min-w-0 items-center gap-0.5 rounded-normal bg-bg-3
                  p-0.5"
              >
                <button
                  v-for="direction in directions"
                  :key="direction.type"
                  type="button"
                  role="radio"
                  :aria-checked="relation.type === direction.type"
                  :aria-label="directionTitle(relation, direction.type)"
                  :data-title-popup="directionTitle(relation, direction.type)"
                  class="flex h-7 min-w-7 cursor-pointer items-center
                    justify-center gap-1 rounded-sm text-lg transition-colors
                    sm:h-8 sm:min-w-8"
                  :class="
                    relation.type === direction.type
                      ? `min-w-0 bg-bg-1 pr-1.5 pl-0.5 text-accent shadow-sm
                        sm:pr-2 sm:pl-1`
                      : `shrink-0 text-text-3 hocus:bg-bg-1/60
                        hocus:text-text-1`
                  "
                  @click="setType(relationKey(relation), direction.type)"
                >
                  <Icon :name="direction.icon" class="shrink-0" />
                  <span
                    v-if="relation.type === direction.type"
                    class="min-w-0 truncate text-xs font-semibold tracking-tight
                      sm:tracking-normal"
                    data-relation-direction-label
                    >{{ direction.label }}</span
                  >
                </button>
              </div>
              <NuxtLink
                v-if="relationHref(relation)"
                :to="relationHref(relation)"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="relationTitle(relation)"
                v-bind="relationPopup(relation)"
                class="flex size-7 shrink-0 items-center justify-center
                  overflow-hidden rounded-sm bg-bg-3 text-text-3 transition
                  sm:size-8 hocus:ring-2 hocus:ring-accent"
                data-relation-other
              >
                <Media
                  v-if="relation.iconMedia"
                  v-bind="relation.iconMedia"
                  class="size-full object-cover"
                />
                <Icon v-else :name="relationEntityIcon(relation.entityType)" />
              </NuxtLink>
              <span
                v-else
                role="img"
                :aria-label="relationTitle(relation)"
                v-bind="relationPopup(relation)"
                class="flex size-7 shrink-0 items-center justify-center
                  overflow-hidden rounded-sm bg-bg-3 text-text-3 sm:size-8"
                data-relation-other
              >
                <Icon :name="relationEntityIcon(relation.entityType)" />
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="delete"
                class="ml-auto"
                :aria-label="phrase.delete_relation"
                :data-title-popup="phrase.delete_relation"
                @click="removeRelation(relationKey(relation))"
              >
                <Icon name="delete" />
              </Button>
            </div>
            <!-- The note has the whole width: it wraps rather than scrolls,
                 and a note per side is marked with whose it is. -->
            <div class="mt-xs flex items-start gap-xs">
              <div
                v-if="relation.note?.type === 'split'"
                class="grid min-w-0 flex-1 gap-xs sm:grid-cols-2"
              >
                <div class="relative min-w-0">
                  <span
                    class="pointer-events-none absolute top-2 left-2 flex size-5
                      items-center justify-center overflow-hidden rounded-sm
                      bg-bg-3 text-xs text-text-2"
                    aria-hidden="true"
                  >
                    <Media
                      v-if="ownerMedia"
                      v-bind="ownerMedia"
                      class="size-full object-cover"
                    />
                    <Icon v-else :name="relationEntityIcon(ownerType)" />
                  </span>
                  <FieldTextarea
                    :model-value="relation.note.currentText ?? ''"
                    autocomplete="off"
                    spellcheck="true"
                    :placeholder="phrase.relation_note_for(ownerName)"
                    :aria-label="phrase.relation_note_for(ownerName)"
                    class="min-w-0! pl-9 text-sm"
                    data-relation-note="current"
                    @keydown.enter.prevent
                    @update:model-value="
                      updateSplitNote(
                        relationKey(relation),
                        'currentText',
                        noteText($event),
                      )
                    "
                  />
                </div>
                <div class="relative min-w-0">
                  <span
                    class="pointer-events-none absolute top-2 left-2 flex size-5
                      items-center justify-center overflow-hidden rounded-sm
                      bg-bg-3 text-xs text-text-3"
                    aria-hidden="true"
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
                  </span>
                  <FieldTextarea
                    :model-value="relation.note.relatedText ?? ''"
                    autocomplete="off"
                    spellcheck="true"
                    :placeholder="
                      phrase.relation_note_for(relationTitle(relation))
                    "
                    :aria-label="
                      phrase.relation_note_for(relationTitle(relation))
                    "
                    class="min-w-0! pl-9 text-sm"
                    data-relation-note="related"
                    @keydown.enter.prevent
                    @update:model-value="
                      updateSplitNote(
                        relationKey(relation),
                        'relatedText',
                        noteText($event),
                      )
                    "
                  />
                </div>
              </div>
              <div v-else class="min-w-0 flex-1">
                <FieldTextarea
                  :model-value="
                    relation.note?.type === 'shared'
                      ? (relation.note.text ?? '')
                      : ''
                  "
                  autocomplete="off"
                  spellcheck="true"
                  :placeholder="phrase.relation_note_placeholder"
                  :aria-label="phrase.relation_note_placeholder"
                  class="min-w-0! text-sm"
                  data-relation-note="shared"
                  @keydown.enter.prevent
                  @update:model-value="
                    updateSharedNote(relationKey(relation), noteText($event))
                  "
                />
              </div>
              <button
                type="button"
                class="flex size-9 shrink-0 cursor-pointer items-center
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
                data-relation-split
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
