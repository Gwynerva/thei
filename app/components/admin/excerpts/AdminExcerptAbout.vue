<script lang="ts" setup>
import {
  isRelationTargetType,
  relationEndOf,
  relationEndpointKey,
  type RelationEditItem,
  type RelationEndpoint,
} from '#layers/thei/shared/relation';
import { relationSentence } from '#layers/thei/shared/relation-display';
import {
  CONTENT_ENTITY_SEARCH_MAX_LIMIT,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import type { ContentOutputData } from '#layers/thei/shared/content';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { contentEntityMentions } from '#layers/thei/shared/content-link-mentions';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import { useRelationRecommendations } from '#layers/thei/app/composables/relation-recommendations';
import { relationModal } from '#layers/thei/app/modals/relation/modal';

/**
 * What an excerpt is about: one project, event or diary entry, never its
 * parent. Empty, it is one dashed tile that opens the picker of a relation
 * (`RelationModal`), with what the excerpt's text links to offered under it;
 * chosen, it is the relation's chip, which opens the same modal — its kind,
 * its note, its other end chosen anew — and a cross that clears it. An
 * excerpt whose subject was deleted says so in the warning tone until the
 * owner chooses again.
 */
const {
  ownerTitle,
  ownerMedia,
  text,
  exclude,
  orphan = false,
} = defineProps<{
  /** What the excerpt is called, for its side of the relation. */
  ownerTitle: string;
  ownerMedia?: MediaDescriptor;
  /** Its text as it is being edited, whose links are offered. */
  text?: ContentOutputData | null;
  /** Kept out of the picker: the excerpt's parent. */
  exclude: RelationEndpoint[];
  /** Stored about nothing: what it was about was deleted. */
  orphan?: boolean;
}>();

const model = defineModel<RelationEditItem | null>({ required: true });

const ownerName = computed(() => publicText(ownerTitle));
const excludedKeys = computed(() => [
  ...exclude.map(relationEndpointKey),
  ...(model.value ? [`${model.value.entityType}:${model.value.entityId}`] : []),
]);

/** What the text links to, in its order: offered while nothing is chosen. */
const mentionedKeys = computed(() => {
  if (model.value) return [];
  const excluded = new Set(excludedKeys.value);
  return [
    ...new Set(
      contentEntityMentions(text)
        .filter((mention) => isRelationTargetType(mention.entityType))
        .map((mention) => `${mention.entityType}:${mention.entityId}`),
    ),
  ]
    .filter((key) => !excluded.has(key))
    .slice(0, CONTENT_ENTITY_SEARCH_MAX_LIMIT);
});
const recommendations = useRelationRecommendations(mentionedKeys);
const offered = computed(() =>
  model.value
    ? []
    : recommendations.value.filter((item) =>
        isRelationTargetType(item.entityType),
      ),
);

function nameOf(item: Pick<RelationEditItem, 'title' | 'date' | 'entityId'>) {
  return entityListName(item, 'abbreviated');
}

/** What the chip says of the relation: its note, this side's first. */
function chipNote(item: RelationEditItem) {
  const note = item.note;
  const said =
    note?.type === 'split' ? note.currentText || note.relatedText : note?.text;
  return said?.trim() ? publicText(said) : undefined;
}

function chipPopup(item: RelationEditItem) {
  const note = chipNote(item);
  return titlePopup(
    {
      text: relationSentence(
        phrase.value,
        item.type,
        ownerName.value,
        entityListName(item),
      ),
      bold: true,
    },
    note && { text: note, italic: true, clamp: true },
  );
}

/** Opens the subject in the relation's modal, or the picker of a new one. */
async function open() {
  const result = await openModal(relationModal, {
    relation: model.value ?? undefined,
    ownerType: 'excerpt',
    ownerName: ownerName.value,
    ownerMedia,
    exclude: () => excludedKeys.value,
    onChange: (changed) => {
      if (isRelationTargetType(changed.entityType)) model.value = changed;
    },
  });
  if (result.type === 'removed') model.value = null;
}

/** One tap makes an offered entity the subject, plainly related. */
function take(entity: ContentEntitySearchItem) {
  if (!isRelationTargetType(entity.entityType)) return;
  model.value = {
    ...relationEndOf({ ...entity, entityType: entity.entityType }),
    type: 'related',
  };
}
</script>

<template>
  <Field ai="field:subject" need="about" data-excerpt-subject>
    <FieldLabel required>{{ phrase.excerpt_about }}</FieldLabel>
    <div v-if="model" class="flex min-w-0 items-center gap-xs">
      <AdminRelationChip
        :entity-type="model.entityType"
        :title="nameOf(model)"
        :media="model.iconMedia"
        :aria-label="phrase.relation_edit(entityListName(model))"
        v-bind="chipPopup(model)"
        data-excerpt-subject-chip
        @click="open"
      >
        <RelationLine
          v-if="model.type !== 'related' || chipNote(model)"
          :type="model.type"
          :text="chipNote(model)"
          italic
          class="-mx-[0.75em] mt-0.5 truncate px-[0.75em]"
        />
      </AdminRelationChip>
      <Button
        variant="secondary"
        size="icon"
        class="shrink-0"
        :aria-label="phrase.excerpt_about_clear"
        :data-title-popup="phrase.excerpt_about_clear"
        data-excerpt-subject-clear
        @click="model = null"
      >
        <Icon name="close" />
      </Button>
    </div>
    <button
      v-else
      type="button"
      class="flex h-12 w-full items-center gap-sm rounded-sm border
        border-dashed px-sm text-left text-sm transition-colors
        focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none"
      :class="
        orphan
          ? 'border-border-warning bg-bg-warning text-text-warning'
          : 'border-border-3 text-text-2 hover:border-accent hover:text-text-1'
      "
      data-excerpt-subject-pick
      :data-excerpt-orphan="orphan || undefined"
      @click="open"
    >
      <Icon :name="orphan ? 'warning' : 'plus'" aria-hidden="true" />
      <span class="min-w-0 flex-1">{{
        orphan ? phrase.excerpt_about_orphan : phrase.excerpt_about_pick
      }}</span>
    </button>
    <div
      v-if="offered.length"
      class="flex flex-wrap gap-2"
      data-excerpt-subject-offers
    >
      <AdminRelationChip
        v-for="item in offered"
        :key="`${item.entityType}:${item.entityId}`"
        suggested
        :entity-type="item.entityType"
        :title="nameOf(item)"
        :media="item.previewMedia"
        :aria-label="phrase.excerpt_about_take(entityListName(item))"
        v-bind="
          titlePopup(
            { text: entityListName(item), bold: true },
            phrase.relation_recommendation_reason,
          )
        "
        data-excerpt-subject-offer
        @click="take(item)"
      >
        <span class="mt-0.5 flex min-w-0 items-center gap-1 text-text-3">
          <Icon
            :name="entityTypeIcon(item.entityType)"
            class="shrink-0"
            aria-hidden="true"
          />
          <span class="min-w-0 truncate">{{
            phrase.relation_recommendation_reason
          }}</span>
        </span>
      </AdminRelationChip>
    </div>
    <FieldHint>{{ phrase.excerpt_about_hint }}</FieldHint>
  </Field>
</template>
