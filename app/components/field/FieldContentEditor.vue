<script lang="ts" setup>
import {
  analyzeContentData,
  type ContentFieldModelValue,
} from '#layers/thei/shared/content';
import { contentEditorModal } from '#layers/thei/app/modals/content-editor/modal';

const props = defineProps<{
  modelValue?: ContentFieldModelValue | null;
  titleLabel: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: ContentFieldModelValue | null];
}>();

const humanSize = useHumanSize();

const analysis = computed(() => analyzeContentData(props.modelValue?.data));
const summary = computed(() => ({
  blockCount: props.modelValue?.blockCount ?? analysis.value.summary.blockCount,
  assetCount: props.modelValue?.assetCount ?? analysis.value.summary.assetCount,
  assetTotalSize:
    props.modelValue?.assetTotalSize ?? analysis.value.summary.assetTotalSize,
}));
const preview = computed(() => analysis.value.preview);

async function openEditor() {
  const result = await openModal(
    contentEditorModal,
    {
      title: props.titleLabel,
      value: props.modelValue,
    },
    {
      label: props.titleLabel,
    },
  );

  if (result.type !== 'save') return;
  emit('update:modelValue', result.value);
}
</script>

<template>
  <button
    type="button"
    data-field
    :aria-label="phrase.edit_content(titleLabel)"
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
        {{ preview.text || phrase.content_empty }}
      </span>
    </span>

    <span
      class="relative flex shrink-0 flex-wrap items-center justify-end gap-md
        text-sm sm:text-base"
    >
      <span
        class="inline-flex cursor-help items-center gap-1 whitespace-nowrap
          text-text-3 transition-colors hocus:text-text-1"
        :data-title-popup="phrase.content_block_count(summary.blockCount)"
      >
        <Icon name="blocks" />
        {{ summary.blockCount }}
      </span>
      <span
        class="inline-flex cursor-help items-center gap-1 whitespace-nowrap
          text-text-3 transition-colors hocus:text-text-1"
        :data-title-popup="phrase.content_file_count(summary.assetCount)"
      >
        <Icon name="file" />
        {{ summary.assetCount }}
        /
        {{ humanSize(summary.assetTotalSize) }}
      </span>
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
