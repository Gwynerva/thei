<script lang="ts" setup>
import {
  analyzeContentData,
  type ContentFieldModelValue,
} from '#layers/thei/shared/content';
import { contentEditorModal } from '#layers/thei/app/modals/content-editor/modal';
import ContentStats from '#layers/thei/app/components/content/ContentStats.vue';
import {
  editorSnapshotStorageKey,
  migrateEditorSnapshots,
  persistentEditorSnapshotKey,
} from '#layers/thei/app/composables/editor-snapshots';

const props = defineProps<{
  modelValue?: ContentFieldModelValue | null;
  titleLabel?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: ContentFieldModelValue | null];
  /** The editor wrote its content back; the form may now save itself. */
  saved: [];
}>();
const temporarySnapshotKey = `draft:${crypto.randomUUID()}`;

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

watch(
  () => props.modelValue?.contentUuid,
  (contentUuid) => {
    if (!contentUuid) return;
    migrateEditorSnapshots(
      temporarySnapshotKey,
      persistentEditorSnapshotKey(contentUuid),
    );
  },
);

onBeforeUnmount(() => {
  if (!props.modelValue?.contentUuid) {
    localStorage.removeItem(editorSnapshotStorageKey(temporarySnapshotKey));
  }
});

function openEditor() {
  const snapshotKey = props.modelValue?.contentUuid
    ? persistentEditorSnapshotKey(props.modelValue.contentUuid)
    : temporarySnapshotKey;
  void openModal(contentEditorModal, {
    title: props.titleLabel,
    value: props.modelValue,
    snapshotKey,
    onSave: (value) => {
      if (value.contentUuid) {
        migrateEditorSnapshots(
          snapshotKey,
          persistentEditorSnapshotKey(value.contentUuid),
        );
      }
      emit('update:modelValue', value);
    },
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
    <MediaEdge
      v-if="preview.media"
      :media="preview.media"
      fade="preview"
      playback="interaction"
      :engaged
      class="w-32 [--media-edge-end:70%] [--media-edge-soft-alpha:10%]
        [--media-edge-soft:45%] [--media-edge-strong-alpha:70%]
        [--media-edge-strong:10%] sm:[--media-edge-end:100%]
        sm:[--media-edge-soft:80%] sm:[--media-edge-strong:35%]"
    />

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
        {{ preview.text || emptyText }}
      </span>
    </span>

    <span
      class="relative flex shrink-0 flex-col items-end gap-1 text-xs
        text-text-3"
    >
      <ContentStats v-bind="summary" class="justify-end" />
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
