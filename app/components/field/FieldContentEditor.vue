<script lang="ts" setup>
import {
  analyzeContentData,
  type ContentFieldModelValue,
  type ContentSlot,
} from '#layers/thei/shared/content';
import {
  contentDigest,
  createNewContentOwnerRef,
  isNewContentOwnerRef,
  type ContentHistoryField,
} from '#layers/thei/shared/content-history';
import { contentEditorModal } from '#layers/thei/app/modals/content-editor/modal';
import { injectContentOwner } from '#layers/thei/app/composables/content-history/owner';
import ContentStats from '#layers/thei/app/components/content/ContentStats.vue';
import ContentMediaEdge from '#layers/thei/app/components/content/ContentMediaEdge.vue';

const props = defineProps<{
  modelValue?: ContentFieldModelValue | null;
  titleLabel?: string;
  /**
   * Which of its owner's fields this is. With the owner a form provides, it
   * is where the field's draft and versions are kept; without either, the
   * editor keeps no history.
   */
  contentSlot?: ContentSlot;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: ContentFieldModelValue | null];
  /** The editor wrote its content back; the form may now save itself. */
  saved: [];
}>();

const owner = injectContentOwner();
/**
 * Text written before its owner exists is kept under an address of its own,
 * fixed for as long as the field is on the page and carried in its value
 * once the editor writes into the form.
 */
const newOwnerRef = import.meta.client ? createNewContentOwnerRef() : '';

const historyField = computed<ContentHistoryField | undefined>(() => {
  if (!owner || !props.contentSlot) return undefined;
  const draftRef = props.modelValue?.draftRef;
  return {
    ownerType: owner.ownerType,
    ownerRef:
      owner.ownerId() ??
      (isNewContentOwnerRef(draftRef) ? draftRef : newOwnerRef),
    slot: props.contentSlot,
  };
});

const valueDigest = computed(() => contentDigest(props.modelValue?.data));

/**
 * The latest draft of the field that says something else than the form, from
 * any tab; for an owner not created yet, from any new one of its kind.
 */
const waitingDraft = computed(() => {
  const field = historyField.value;
  if (!owner || !field) return undefined;
  return owner
    .draftsFor(field.slot)
    .find((draft) => draft.digest !== valueDigest.value);
});

/**
 * The latest draft written for another new owner, which the editor offers to
 * take up. Drafts of the field itself it finds by its address.
 */
function pendingDraft() {
  const field = historyField.value;
  if (!owner || !field || !isNewContentOwnerRef(field.ownerRef))
    return undefined;
  return owner
    .draftsFor(field.slot)
    .find((draft) => draft.ownerRef !== field.ownerRef);
}

const analysis = computed(() => analyzeContentData(props.modelValue?.data));
const summary = computed(() => ({
  blockCount: props.modelValue?.blockCount ?? analysis.value.summary.blockCount,
  wordCount: analysis.value.summary.wordCount,
  assetCount: props.modelValue?.assetCount ?? analysis.value.summary.assetCount,
  assetTotalSize:
    props.modelValue?.assetTotalSize ?? analysis.value.summary.assetTotalSize,
}));
const preview = computed(() => analysis.value.preview);
const emptyText = computed(() =>
  preview.value.media
    ? phrase.value.content_text_empty
    : phrase.value.content_empty,
);

function draftTime(value: number) {
  const today = new Date().toDateString() === new Date(value).toDateString();
  return new Intl.DateTimeFormat(language.value.code, {
    ...(today ? {} : { dateStyle: 'short' }),
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(value);
}

function openEditor() {
  const field = historyField.value;
  void openModal(contentEditorModal, {
    title: props.titleLabel,
    value: props.modelValue,
    history: field ? { field, pending: pendingDraft } : undefined,
    onSave: (value) => emit('update:modelValue', value),
    onSaved: () => emit('saved'),
    current: () => props.modelValue,
  });
}
const { engaged, events: mediaEvents } = useMediaInteraction();
</script>

<template>
  <button
    type="button"
    data-field
    :aria-label="phrase.edit_content(titleLabel || phrase.content_editor_title)"
    class="group relative flex min-h-20 w-full cursor-pointer items-center
      justify-between gap-sm overflow-hidden rounded-normal border-2
      border-border-1 bg-bg-1 p-xs text-left transition sm:p-sm
      hocus:border-border-3 hocus:bg-bg-3"
    v-on="mediaEvents"
    @click="openEditor"
  >
    <ContentMediaEdge v-if="preview.media" :media="preview.media" :engaged />

    <span
      class="relative flex min-w-0 flex-1 items-center gap-xs"
      :class="preview.media ? 'ml-md sm:ml-12' : undefined"
    >
      <span
        class="-ml-xs max-w-100 min-w-0 pl-xs text-sm sm:text-base"
        :class="
          preview.text
            ? 'content-preview-text line-clamp-3 text-text-2'
            : 'text-text-3 italic'
        "
      >
        {{ publicText(preview.text) || emptyText }}
      </span>
    </span>

    <span
      class="relative flex shrink-0 flex-col items-end gap-1 text-xs
        text-text-3"
    >
      <ContentStats v-bind="summary" class="justify-end" />
      <span
        v-if="waitingDraft"
        class="text-right text-text-warning"
        data-field-unsaved-draft
      >
        {{
          phrase.content_field_unsaved_draft(draftTime(waitingDraft.updatedAt))
        }}
      </span>
      <TheiTime v-if="modelValue?.updatedAt" :datetime="modelValue.updatedAt" />
      <span v-else>{{ phrase.content_never_saved }}</span>
    </span>
  </button>
</template>

<style scoped>
.content-preview-text {
  text-shadow:
    0 0 0.5em var(--color-bg-1),
    0 0 0.9em var(--color-bg-1),
    0 0.12em 0.45em var(--color-bg-1);
}
</style>
