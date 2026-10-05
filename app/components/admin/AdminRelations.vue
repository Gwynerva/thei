<script lang="ts" setup>
import {
  isRelationEntityType,
  orderRelationsForEditing,
  RELATION_ENTITY_TYPES,
  relationEndpointKey,
  type RelationEditItem,
  type RelationEndpoint,
  type RelationEntityType,
} from '#layers/thei/shared/relation';
import {
  relationEntityIcon,
  relationSentence,
} from '#layers/thei/shared/relation-display';
import {
  CONTENT_ENTITY_SEARCH_MAX_LIMIT,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import type { ContentOutputData } from '#layers/thei/shared/content';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { contentEntityMentions } from '#layers/thei/shared/public-content-reference';
import type { TabItem } from '#layers/thei/app/components/UnderlineTabs.vue';
import { moveItemById } from '#layers/thei/app/composables/drag-sort';
import { useRelationRecommendations } from '#layers/thei/app/composables/relation-recommendations';
import { relationModal } from '#layers/thei/app/modals/relation/modal';

/**
 * The relations block of a project, an event or a diary entry.
 *
 * Any of the three draws relations to any of the three, and the other end
 * lists the relation from its side. One tab per kind of thing on the other
 * end, all three always there, heading the block; each relation a chip
 * (`AdminRelationChip`) that opens the relation itself (`RelationModal`),
 * the same modal "+" opens for a new one. Projects and events are ordered
 * by hand, dragged
 * as tags are; diary entries are days, so they keep the order of their
 * days, the newest first. A long list scrolls inside the block rather than
 * stretching the form.
 *
 * Below the line at the foot, the block recommends what the entity's own
 * text links to and is not related yet.
 */
const { owner, ownerType, ownerTitle, ownerMedia, text } = defineProps<{
  /** The entity being edited, kept out of the picker; absent until created. */
  owner?: RelationEndpoint;
  ownerType: RelationEntityType;
  /** What the entity is called, for its side of a relation. */
  ownerTitle: string;
  /** Its picture, if it has one of its own yet; its kind's glyph otherwise. */
  ownerMedia?: MediaDescriptor;
  /** Its text as it is being edited, whose links the block recommends. */
  text?: ContentOutputData | null;
}>();

const model = defineModel<RelationEditItem[]>({ required: true });

const panelId = useId();
const panel = useTemplateRef<HTMLElement>('panel');
const relations = computed(() => model.value ?? []);
const excludedKeys = computed(() => [
  ...(owner ? [relationEndpointKey(owner)] : []),
  ...relations.value.map(relationKey),
]);

const ownerName = computed(() => publicText(ownerTitle));

/** The `type:uuid` key of a relation's other end (`relationEndpointKey`). */
function relationKey(item: { entityType: string; entityId: string }) {
  return `${item.entityType}:${item.entityId}`;
}

/** What a related entity is called: a diary entry by its day. */
function relationTitle(
  item: Pick<RelationEditItem, 'title' | 'date' | 'entityId'>,
  style: 'long' | 'abbreviated' = 'long',
) {
  if (item.date)
    return entityDisplayTitle(
      { title: item.title ?? '', date: item.date },
      style,
    );
  return item.title ? publicText(item.title) : item.entityId;
}

/**
 * The relations to one kind of entity. The list is kept in the order it is
 * shown (`replaceRelations`), so a kind's chips are already in theirs.
 */
function ofKind(items: RelationEditItem[], type: RelationEntityType) {
  return items.filter((item) => item.entityType === type);
}

const kindTitles = computed<Record<RelationEntityType, string>>(() => ({
  project: phrase.value.projects,
  event: phrase.value.events,
  'diary-entry': phrase.value.diary,
}));

function firstKind() {
  return (
    RELATION_ENTITY_TYPES.find(
      (type) => ofKind(relations.value, type).length,
    ) ?? 'project'
  );
}

/**
 * The kind on show: the first that has any, until the block is used — a
 * tab chosen, a relation opened or added. Until then the tab follows the
 * list, should it come after the form.
 */
const selected = ref<RelationEntityType>(firstKind());
const used = ref(false);
watch(relations, () => {
  if (!used.value && !ofKind(relations.value, selected.value).length)
    selected.value = firstKind();
});

function choose(kind: RelationEntityType) {
  used.value = true;
  selected.value = kind;
}
const shown = computed(() => ofKind(relations.value, selected.value));
/** Diary entries keep the order of their days; the rest is dragged. */
const sortable = computed(() => selected.value !== 'diary-entry');

const tabs = computed<TabItem<RelationEntityType>[]>(() =>
  RELATION_ENTITY_TYPES.map((type) => ({
    key: type,
    label: kindTitles.value[type],
    icon: relationEntityIcon(type),
    count: ofKind(relations.value, type).length,
  })),
);

/** What the text links to and is not related yet, in the text's order. */
const mentionedKeys = computed(() => {
  const excluded = new Set(excludedKeys.value);
  return [
    ...new Set(
      contentEntityMentions(text)
        .filter((mention) => isRelationEntityType(mention.entityType))
        .map((mention) => `${mention.entityType}:${mention.entityId}`),
    ),
  ]
    .filter((key) => !excluded.has(key))
    .slice(0, CONTENT_ENTITY_SEARCH_MAX_LIMIT);
});
const recommendations = useRelationRecommendations(mentionedKeys);

/**
 * What a chip says of its relation's reason: the note as this entity's page
 * shows it, or the other side's when this side has none.
 */
function chipNote(item: RelationEditItem) {
  const note = item.note;
  const text =
    note?.type === 'split' ? note.currentText || note.relatedText : note?.text;
  return text?.trim() ? publicText(text) : undefined;
}

function chipPopup(item: RelationEditItem) {
  const noteText = chipNote(item);
  return titlePopup(
    {
      text: relationSentence(
        phrase.value,
        item.type,
        ownerName.value,
        relationTitle(item),
      ),
      bold: true,
    },
    noteText && { text: noteText, italic: true, clamp: true },
  );
}

function recommendationPopup(item: ContentEntitySearchItem) {
  return titlePopup(
    { text: relationTitle(item), bold: true },
    phrase.value.relation_recommendation_reason,
  );
}

/** A new relation is a plain one with nothing said of it yet. */
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
  // Show the tab the new chip landed in, or it would be added out of sight.
  choose(entity.entityType);
  revealChip(relationKey(entity));
}

function revealChip(key: string) {
  void nextTick(() =>
    panel.value
      ?.querySelector<HTMLElement>(`[data-relation-key="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ block: 'nearest' }),
  );
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
 * Puts one relation's new state in place. Neither its kind nor its note
 * moves it, so the list keeps its order, and every other chip keeps the very
 * item it drew.
 */
function updateRelation(key: string, item: RelationEditItem) {
  model.value = relations.value.map((current) =>
    relationKey(current) === key ? item : current,
  );
}

/**
 * Puts what the modal made of a relation into the list, in place of what it
 * was (`previous`), and says what it is known by now: its other end may have
 * been chosen anew. A new relation, or one now of another kind, goes to the
 * end of its kind; one of the same kind keeps its place.
 */
function putRelation(previous: string | undefined, item: RelationEditItem) {
  const key = relationKey(item);
  if (previous === key) {
    updateRelation(key, item);
    return key;
  }
  const list = relations.value;
  const index = list.findIndex((current) => relationKey(current) === previous);
  const replaced = list[index];
  replaceRelations(
    replaced?.entityType === item.entityType
      ? list.map((current, at) => (at === index ? item : current))
      : [...list.filter((_, at) => at !== index), item],
  );
  choose(item.entityType);
  revealChip(key);
  return key;
}

/** Opens a relation in its modal, or a new one without `item`. */
async function openRelation(item?: RelationEditItem) {
  used.value = true;
  let key = item && relationKey(item);
  const result = await openModal(relationModal, {
    relation: item,
    ownerType,
    ownerName: ownerName.value,
    ownerMedia,
    exclude: () => excludedKeys.value,
    onChange: (changed) => {
      key = putRelation(key, changed);
    },
  });
  if (result.type === 'removed' && key) removeRelation(key);
}

const { guardClick } = useDragSort(panel, {
  onDrop: ({ id, newIndex }) => {
    const type = selected.value;
    const moved = moveItemById(
      ofKind(relations.value, type),
      id,
      newIndex,
      relationKey,
    );
    replaceRelations(
      RELATION_ENTITY_TYPES.flatMap((kind) =>
        kind === type ? moved : ofKind(relations.value, kind),
      ),
    );
  },
});
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
          :label="phrase.related_entity_add"
          @click="openRelation()"
        />
      </template>
    </SectionHeader>

    <Box class="flex flex-col overflow-hidden" data-relations>
      <UnderlineTabs
        :model-value="selected"
        :tabs="tabs"
        :label="phrase.related_entities"
        :controls="panelId"
        class="px-xs max-sm:justify-center sm:px-sm"
        @update:model-value="choose"
      />
      <div
        :id="panelId"
        :aria-labelledby="`${panelId}-${selected}-tab`"
        ref="panel"
        role="tabpanel"
        class="flex scrollbar-mini max-h-120 flex-wrap content-start items-start
          gap-2 overflow-y-auto overscroll-contain p-sm sm:p-md"
        data-relation-panel
      >
        <AdminRelationChip
          v-for="relation in shown"
          :key="relationKey(relation)"
          :data-drag-id="sortable ? relationKey(relation) : undefined"
          :data-relation-key="relationKey(relation)"
          data-relation-chip
          :entity-type="relation.entityType"
          :title="relationTitle(relation, 'abbreviated')"
          :media="relation.iconMedia"
          :class="{ 'cursor-grab active:cursor-grabbing': sortable }"
          :aria-label="phrase.relation_edit(relationTitle(relation))"
          v-bind="chipPopup(relation)"
          @click="guardClick(() => openRelation(relation))"
        >
          <!-- A plain relation with nothing said of it is its name alone. -->
          <RelationLine
            v-if="relation.type !== 'related' || chipNote(relation)"
            :type="relation.type"
            :text="chipNote(relation)"
            italic
            class="-mx-[0.75em] mt-0.5 truncate px-[0.75em]"
          />
        </AdminRelationChip>
        <p
          v-if="!shown.length"
          class="self-center text-sm text-text-3 italic"
          data-relations-empty
        >
          {{ phrase.relations_empty_of(selected) }}
        </p>
      </div>

      <!-- What the text links to and is not related yet: one tap relates it
           as plainly related, with nothing said of it. -->
      <div
        v-if="recommendations.length"
        class="border-t border-border-1 bg-bg-1/50 p-sm sm:p-md"
        data-relation-recommendations
      >
        <p class="mb-xs text-sm font-semibold text-text-3">
          {{ phrase.recommended_relations }}
        </p>
        <div class="flex flex-wrap gap-2">
          <AdminRelationChip
            v-for="item in recommendations"
            :key="relationKey(item)"
            suggested
            :entity-type="item.entityType"
            :title="relationTitle(item, 'abbreviated')"
            :media="item.previewMedia"
            :aria-label="
              phrase.relation_recommendation_add(relationTitle(item))
            "
            v-bind="recommendationPopup(item)"
            data-relation-recommendation
            @click="addRelation(item)"
          >
            <span class="mt-0.5 flex min-w-0 items-center gap-1 text-text-3">
              <Icon
                :name="relationEntityIcon(item.entityType)"
                class="shrink-0"
                aria-hidden="true"
              />
              <span class="min-w-0 truncate">{{
                entityTypeLabel(item.entityType)
              }}</span>
            </span>
          </AdminRelationChip>
        </div>
      </div>
    </Box>
  </div>
</template>
