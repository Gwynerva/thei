<script lang="ts" setup>
import {
  collectContentAssetSizeMap,
  normalizeContentData,
  summarizeContentData,
  type ContentFieldModelValue,
} from '#layers/thei/shared/content';
import { contentEditorModal } from '#layers/thei/app/modals/content-editor/modal';

const props = defineProps<{
  modelValue?: ContentFieldModelValue | null;
  label: string;
  hint?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: ContentFieldModelValue | null];
}>();

const humanSize = useHumanSize();

const contentData = computed(() =>
  normalizeContentData(props.modelValue?.data),
);
const summary = computed(() => ({
  ...summarizeContentData(
    contentData.value,
    collectContentAssetSizeMap(contentData.value),
  ),
  blockCount: props.modelValue?.blockCount ?? contentData.value.blocks.length,
  assetCount: props.modelValue?.assetCount,
  assetTotalSize: props.modelValue?.assetTotalSize,
}));

const hasContent = computed(() => contentData.value.blocks.length > 0);
const summaryText = computed(() => {
  if (!hasContent.value) return phrase.value.content_empty;
  const blockCount =
    summary.value.blockCount ?? contentData.value.blocks.length;
  const assetCount =
    summary.value.assetCount ??
    summarizeContentData(
      contentData.value,
      collectContentAssetSizeMap(contentData.value),
    ).assetCount;
  const assetTotalSize =
    summary.value.assetTotalSize ??
    summarizeContentData(
      contentData.value,
      collectContentAssetSizeMap(contentData.value),
    ).assetTotalSize;

  return [
    phrase.value.content_block_count(blockCount),
    phrase.value.content_file_count(assetCount),
    humanSize(assetTotalSize),
  ].join(' / ');
});

async function openEditor() {
  const result = await openModal(contentEditorModal, {
    title: props.label,
    value: props.modelValue,
  });

  if (result.type !== 'save') return;
  const data = normalizeContentData(result.value.data);
  if (data.blocks.length === 0) {
    emit('update:modelValue', {
      contentUuid: props.modelValue?.contentUuid,
      data,
      blockCount: 0,
      assetCount: 0,
      assetTotalSize: 0,
    });
    return;
  }

  const computedSummary = summarizeContentData(
    data,
    collectContentAssetSizeMap(data),
  );
  emit('update:modelValue', {
    contentUuid: props.modelValue?.contentUuid,
    data,
    ...computedSummary,
  });
}
</script>

<template>
  <Field>
    <FieldLabel>{{ label }}</FieldLabel>
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-sm
        rounded-normal border border-border-1 bg-bg-1 px-sm py-xs text-left
        transition hocus:border-border-3 hocus:bg-bg-3"
      @click="openEditor"
    >
      <span class="min-w-0">
        <span class="block truncate font-semibold text-text-1">
          {{ summaryText }}
        </span>
        <span v-if="hint" class="mt-0.5 block text-sm text-text-3">
          {{ hint }}
        </span>
      </span>
      <span class="flex shrink-0 items-center gap-xs text-sm text-accent">
        <Icon name="edit" />
        <span>{{ phrase.edit }}</span>
      </span>
    </button>
  </Field>
</template>
