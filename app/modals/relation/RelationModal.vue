<script lang="ts" setup>
import {
  isRelationEntityType,
  mergeRelationNote,
  RELATION_TYPES,
  relationHasNote,
  splitRelationNote,
  type RelationEditItem,
  type RelationEntityType,
  type RelationNote,
  type RelationType,
} from '#layers/thei/shared/relation';
import {
  relationEntityIcon,
  relationLabel,
  relationSentenceParts,
  relationTypeIcon,
} from '#layers/thei/shared/relation-display';
import type {
  ContentEntityChoice,
  ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { IconName } from '#thei/icons';
import ContentEntitySearchPopup from '#layers/thei/app/components/content/ContentEntitySearchPopup.vue';
import ModalContainer from '#layers/thei/app/modals/ModalContainer.vue';
import ModalTitle from '#layers/thei/app/modals/ModalTitle.vue';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';

/**
 * One relation of the relations block, new or opened from its chip: the
 * entity on its other end, chosen with the picker; what the relation is,
 * from its three kinds, each said as a sentence with both names and their
 * pictures; and its note, written once or once per side.
 *
 * Every change goes to the form at once, as an edit of the form itself: the
 * relation is saved with the entity, so the modal has nothing of its own to
 * save, and closing it in any way keeps what was done. A new relation joins
 * the form once its other end is chosen; until then there is nothing to
 * keep, and its kind and note wait for it.
 */
type ModalData = {
  /** The relation opened; absent for a new one. */
  relation?: RelationEditItem;
  ownerType: RelationEntityType;
  /** What the entity being edited is called, formatted. */
  ownerName: string;
  ownerMedia?: MediaDescriptor;
  /** The `type:uuid` keys the picker leaves out: the owner, what is related. */
  exclude: () => string[];
  onChange: (relation: RelationEditItem) => void;
};
type Result = { type: 'removed' };
/** A relation whose other end may not be chosen yet. */
type Draft = Omit<RelationEditItem, 'entityType' | 'entityId'> &
  Partial<Pick<RelationEditItem, 'entityType' | 'entityId'>>;

const emit = defineEmits<{ modalResult: [result: Result] }>();
const props = defineProps<{ modalData: ModalData }>();

const relation = ref<Draft>(
  props.modalData.relation
    ? { ...props.modalData.relation }
    : { type: 'related' },
);
const openedNote = props.modalData.relation?.note;
const typeGroup = useId();
const entityAnchor = useTemplateRef<HTMLElement>('entityAnchor');
const entitySearch =
  useTemplateRef<InstanceType<typeof ContentEntitySearchPopup>>('entitySearch');
const pickerOpen = ref(false);

function chosen(draft: Draft): draft is RelationEditItem {
  return Boolean(draft.entityType && draft.entityId);
}

const other = computed(() =>
  chosen(relation.value) ? relation.value : undefined,
);

function update(patch: Partial<Draft>) {
  relation.value = { ...relation.value, ...patch };
  if (chosen(relation.value)) props.modalData.onChange(relation.value);
}

/** What the other end is called: a diary entry by its day. */
const otherName = computed(() => {
  const item = other.value;
  if (!item) return '';
  if (item.date)
    return entityDisplayTitle({ title: item.title ?? '', date: item.date });
  return item.title ? publicText(item.title) : item.entityId;
});

/** The other end as the picker pins it, marked, at the top of its list. */
const choice = computed<ContentEntityChoice | undefined>(() => {
  const item = other.value;
  if (!item) return undefined;
  return {
    entityType: item.entityType,
    entityId: item.entityId,
    title: item.title ?? '',
    summary: item.summary ?? '',
    ...(item.date ? { date: item.date } : {}),
    previewMedia: item.iconMedia,
  };
});

function pick(entity: ContentEntitySearchItem) {
  pickerOpen.value = false;
  if (!isRelationEntityType(entity.entityType)) return;
  update({
    entityType: entity.entityType,
    entityId: entity.entityId,
    title: entity.title,
    summary: entity.summary,
    humanReadableSlug: entity.humanReadableSlug,
    publicId: entity.publicId,
    date: entity.date,
    iconMedia: entity.previewMedia,
  });
}

// A new relation starts with its other end: the picker is open at once.
onMounted(() => {
  if (!other.value) void nextTick(() => (pickerOpen.value = true));
});

type Side = {
  name: string;
  media?: MediaDescriptor;
  icon: IconName;
};

/** The two ends as the sentences and the notes draw them. */
const ends = computed<Record<'current' | 'other', Side | undefined>>(() => ({
  current: {
    name: props.modalData.ownerName,
    media: props.modalData.ownerMedia,
    icon: relationEntityIcon(props.modalData.ownerType),
  },
  other: other.value && {
    name: otherName.value,
    media: other.value.iconMedia,
    icon: relationEntityIcon(other.value.entityType),
  },
}));

const types = computed(() =>
  RELATION_TYPES.map((type) => ({
    type,
    icon: relationTypeIcon(type),
    label: relationLabel(phrase.value, type),
    sentence: relationSentenceParts(phrase.value, type),
  })),
);

function setType(type: RelationType) {
  if (type !== relation.value.type) update({ type });
}

/**
 * A note is one paragraph that wraps in its field: a line break pasted into
 * it becomes a space, as it would in a single-line field.
 */
function noteText(value: unknown) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ');
}

/**
 * A note as the form keeps it. A side left empty has no text at all, as the
 * edit API reads it out; and a note emptied again is the one the relation
 * was opened with, if that said nothing either. Typing and deleting leaves
 * the form as it was loaded.
 */
function settle(note: RelationNote): RelationNote | undefined {
  if (note.type === 'split')
    return {
      type: 'split',
      currentText: note.currentText || undefined,
      relatedText: note.relatedText || undefined,
    };
  if (note.text) return note;
  return relationHasNote(openedNote) || openedNote?.type === 'split'
    ? { type: 'shared' }
    : openedNote;
}

function setNote(note: RelationNote) {
  update({ note: settle(note) });
}

const split = computed(() => relation.value.note?.type === 'split');

function setSplit(value: boolean | undefined) {
  if (Boolean(value) === split.value) return;
  setNote(
    value
      ? splitRelationNote(relation.value.note)
      : mergeRelationNote(relation.value.note),
  );
}

const sharedText = computed(() =>
  relation.value.note?.type === 'shared'
    ? (relation.value.note.text ?? '')
    : '',
);

/** The two sides of a note written once per side, this entity's first. */
const sides = computed(() => {
  const note: { currentText?: string; relatedText?: string } =
    relation.value.note?.type === 'split' ? relation.value.note : {};
  return [
    {
      key: 'currentText' as const,
      side: 'current',
      text: note.currentText ?? '',
      end: ends.value.current,
    },
    {
      key: 'relatedText' as const,
      side: 'related',
      text: note.relatedText ?? '',
      end: ends.value.other,
    },
  ];
});

function setSide(key: 'currentText' | 'relatedText', text: string) {
  const note =
    relation.value.note?.type === 'split'
      ? relation.value.note
      : splitRelationNote(relation.value.note);
  setNote({ ...note, [key]: text });
}

function remove() {
  emit('modalResult', { type: 'removed' });
}
</script>

<template>
  <ModalContainer class="max-w-140" data-relation-modal>
    <template #header>
      <div class="flex items-center gap-sm p-sm">
        <ModalTitle
          icon="arrow-cycle"
          :title="
            modalData.relation ? phrase.relation : phrase.related_entity_add
          "
          class="flex-1"
        />
        <div class="flex items-center gap-xs">
          <ModalHeaderButton
            v-if="other"
            icon="delete"
            variant="delete"
            :label="phrase.delete_relation"
            data-relation-remove
            @click="remove"
          />
          <ModalHeaderButton
            variant="accent"
            :label="phrase.done"
            @click="closeModal"
          >
            {{ phrase.done }}
          </ModalHeaderButton>
        </div>
      </div>
    </template>

    <div class="flex flex-col gap-md p-sm">
      <!-- The other end, chosen with the picker. What the field and the
           kinds below are needs no words on the screen. -->
      <Field>
        <div ref="entityAnchor" class="flex min-w-0 gap-xs">
          <button
            type="button"
            aria-haspopup="dialog"
            :aria-expanded="pickerOpen"
            class="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center
              gap-xs rounded-normal border-2 border-border-1 bg-bg-1 px-xs py-1
              text-left transition hocus:border-border-3"
            data-relation-entity
            @click="pickerOpen = !pickerOpen"
          >
            <span class="sr-only">{{ phrase.relation_entity }}: </span>
            <template v-if="other">
              <EntityTokenIcon
                :media="other.iconMedia"
                :icon="relationEntityIcon(other.entityType)"
                class="size-8"
              />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-semibold">{{ otherName }}</span>
                <span class="truncate text-xs text-text-3">{{
                  entityTypeLabel(other.entityType)
                }}</span>
              </span>
            </template>
            <span v-else class="min-w-0 flex-1 truncate text-text-3">{{
              phrase.relation_entity_choose
            }}</span>
            <Icon
              name="chevron-right"
              class="shrink-0 rotate-90 text-text-3"
              aria-hidden="true"
            />
          </button>
        </div>
        <FloatingPopup
          v-model:open="pickerOpen"
          :anchor="entityAnchor"
          placement="bottom-start"
          :fallback-placements="['top-start']"
          max-width="26rem"
          teleport-to="dialog"
          @opened="entitySearch?.focus()"
        >
          <ContentEntitySearchPopup
            ref="entitySearch"
            :entity-types="['project', 'event', 'diary-entry']"
            :exclude="modalData.exclude()"
            :chosen="choice"
            @select="pick"
            @confirm="pickerOpen = false"
          />
        </FloatingPopup>
      </Field>

      <fieldset class="flex min-w-0 flex-col gap-xs">
        <legend class="sr-only">
          {{ phrase.relation_direction }}
        </legend>
        <label
          v-for="option in types"
          :key="option.type"
          class="flex cursor-pointer flex-col gap-1 rounded-normal border-2
            border-border-1 p-xs transition has-checked:border-accent
            has-checked:bg-accent/8 has-focus-visible:ring-2
            has-focus-visible:ring-accent hocus:border-border-3
            has-checked:hocus:border-accent"
          :data-relation-option="option.type"
        >
          <input
            type="radio"
            :name="typeGroup"
            :value="option.type"
            :checked="relation.type === option.type"
            class="sr-only"
            @change="setType(option.type)"
          />
          <span class="flex items-center gap-xs font-semibold">
            <Icon
              :name="option.icon"
              class="shrink-0 text-xl text-accent"
              aria-hidden="true"
            />
            <span>{{ option.label }}</span>
          </span>
          <!-- The sentence with both names, each with its picture; the other
               end waits as a blank until it is chosen. -->
          <span class="text-xs leading-relaxed text-text-3">
            <template v-for="(part, index) in option.sentence" :key="index">
              <template v-if="typeof part === 'string'">{{ part }}</template>
              <span
                v-else-if="ends[part.side]"
                class="font-semibold text-text-2"
                data-relation-token
                ><span class="mr-1 inline-block size-4 align-[-0.2em]"
                  ><EntityTokenIcon
                    :media="ends[part.side]!.media"
                    :icon="ends[part.side]!.icon"
                    class="size-full" /></span
                >{{ ends[part.side]!.name }}</span
              >
              <span
                v-else
                class="inline-block h-3 w-8 rounded-xs border border-dashed
                  border-border-3 align-[-0.1em]"
                aria-hidden="true"
              />
            </template>
          </span>
        </label>
      </fieldset>

      <Field>
        <div class="flex items-center justify-between gap-sm">
          <FieldLabel>{{ phrase.relation_note }}</FieldLabel>
          <span :data-title-popup="phrase.relation_note_split_hint">
            <FieldToggle
              :model-value="split"
              :switch-label="phrase.relation_note_split_hint"
              data-relation-split
              @update:model-value="setSplit"
            >
              <span
                class="cursor-pointer select-none"
                @click="setSplit(!split)"
                >{{ phrase.relation_note_split }}</span
              >
            </FieldToggle>
          </span>
        </div>
        <template v-if="split">
          <div
            v-for="side in sides"
            :key="side.key"
            class="flex flex-col gap-xs"
            data-field
          >
            <FieldLabel
              class="flex min-w-0 items-center gap-xs text-sm font-normal
                text-text-2"
            >
              <span class="shrink-0">{{ phrase.relation_note_on_page }}</span>
              <template v-if="side.end">
                <EntityTokenIcon
                  :media="side.end.media"
                  :icon="side.end.icon"
                  class="size-5"
                />
                <span class="min-w-0 truncate font-semibold text-text-1">{{
                  side.end.name
                }}</span>
              </template>
              <span
                v-else
                class="inline-block h-3 w-8 rounded-xs border border-dashed
                  border-border-3"
                aria-hidden="true"
              />
            </FieldLabel>
            <FieldTextarea
              :model-value="side.text"
              autocomplete="off"
              spellcheck="true"
              :placeholder="phrase.relation_note_placeholder"
              :aria-label="
                side.end
                  ? `${phrase.relation_note_on_page} ${side.end.name}`
                  : phrase.relation_note_on_page
              "
              :data-relation-note="side.side"
              @keydown.enter.prevent
              @update:model-value="setSide(side.key, noteText($event))"
            />
          </div>
        </template>
        <template v-else>
          <FieldTextarea
            :model-value="sharedText"
            autocomplete="off"
            spellcheck="true"
            :placeholder="phrase.relation_note_placeholder"
            :aria-label="phrase.relation_note"
            data-relation-note="shared"
            @keydown.enter.prevent
            @update:model-value="
              setNote({ type: 'shared', text: noteText($event) })
            "
          />
          <FieldHint>{{ phrase.relation_note_shared_hint }}</FieldHint>
        </template>
      </Field>
    </div>
  </ModalContainer>
</template>
