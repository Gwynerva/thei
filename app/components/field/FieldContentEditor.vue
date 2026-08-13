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
  });
}
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
    @click="openEditor"
  >
    <span
      v-if="preview.media"
      class="content-preview-media absolute inset-y-0 left-0 w-32 bg-bg-accent
        [--preview-mask-end:70%] [--preview-mask-soft-alpha:5%]
        [--preview-mask-soft:45%] [--preview-mask-start-alpha:35%]
        [--preview-mask-strong-alpha:25%] [--preview-mask-strong:10%]
        sm:[--preview-mask-end:100%] sm:[--preview-mask-soft-alpha:10%]
        sm:[--preview-mask-soft:80%] sm:[--preview-mask-start-alpha:100%]
        sm:[--preview-mask-strong-alpha:70%] sm:[--preview-mask-strong:35%]"
    >
      <Media
        v-bind="preview.media"
        class="size-full opacity-75 transition group-hocus:opacity-100"
      />
    </span>

    <span
      class="relative flex min-w-0 flex-1 items-center gap-xs"
      :class="preview.media ? 'ml-0 sm:ml-12' : undefined"
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
.content-preview-media {
  /* The media should dissolve into the field background, as in project search. */
  mask-image: linear-gradient(
    to right,
    rgb(0 0 0 / var(--preview-mask-start-alpha)) 0%,
    rgb(0 0 0 / var(--preview-mask-strong-alpha)) var(--preview-mask-strong),
    rgb(0 0 0 / var(--preview-mask-soft-alpha)) var(--preview-mask-soft),
    transparent var(--preview-mask-end)
  );
}

.content-preview-text {
  text-shadow:
    0 0 0.5em var(--color-bg-1),
    0 0 0.9em var(--color-bg-1),
    0 0.12em 0.45em var(--color-bg-1);
}
</style>
