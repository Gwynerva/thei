<script lang="ts" setup>
import type { ContentAssetData } from '#layers/thei/shared/content';
import { contentAttachmentSuggestedTitle } from './content-attachment';

const props = withDefaults(
  defineProps<{
    asset: ContentAssetData;
    title?: string;
    description?: string;
    editable?: boolean;
    href?: string;
    fallbackTitle?: string;
    editLabel?: string;
    titlePlaceholder?: string;
    descriptionPlaceholder?: string;
  }>(),
  {
    title: '',
    description: '',
    editable: false,
    href: undefined,
    fallbackTitle: '',
    editLabel: '',
    titlePlaceholder: '',
    descriptionPlaceholder: '',
  },
);

const emit = defineEmits<{
  edit: [];
  title: [value: string];
  description: [value: string];
}>();

const resolvedTitle = computed(
  () =>
    props.title ||
    contentAttachmentSuggestedTitle(props.asset) ||
    props.fallbackTitle,
);
</script>

<template>
  <component
    :is="!editable && href ? 'a' : 'div'"
    :href="!editable && href ? href : undefined"
    :target="!editable && href ? '_blank' : undefined"
    :rel="!editable && href ? 'noopener noreferrer' : undefined"
    class="group flex min-w-0 items-center gap-sm rounded-normal border-2
      border-border-1 bg-bg-2 p-xs text-text-1 no-underline transition-colors
      outline-none focus-within:border-accent focus-within:bg-bg-accent
      hocus:border-accent hocus:bg-bg-accent"
  >
    <button
      v-if="editable"
      type="button"
      data-drag-ignore
      class="size-16 shrink-0 cursor-pointer text-text-2 transition-colors
        outline-none hocus:text-accent"
      :aria-label="editLabel"
      @click.stop="emit('edit')"
    >
      <FilePreview :extension="asset.extension" class="size-full" />
    </button>
    <FilePreview
      v-else
      :extension="asset.extension"
      class="size-16 shrink-0 text-text-2"
    />

    <div class="flex min-w-0 flex-1 flex-col justify-center">
      <ContentPlainTextField
        v-if="editable"
        :model-value="resolvedTitle"
        :editable="true"
        :placeholder="titlePlaceholder"
        class="min-h-6 truncate font-semibold tracking-tight transition-colors
          outline-none group-focus-within:text-accent group-hocus:text-accent
          empty:before:pointer-events-none empty:before:text-text-3
          empty:before:content-[attr(data-placeholder)] focus:before:hidden"
        @update:model-value="emit('title', $event)"
      />
      <div
        v-else
        class="truncate font-semibold tracking-tight transition-colors
          group-hocus:text-accent"
      >
        {{ resolvedTitle }}
      </div>

      <ContentPlainTextField
        v-if="editable"
        :model-value="description"
        :editable="true"
        :placeholder="descriptionPlaceholder"
        class="min-h-5 truncate text-sm text-text-2 outline-none
          empty:before:pointer-events-none empty:before:text-text-3
          empty:before:content-[attr(data-placeholder)] focus:before:hidden"
        @update:model-value="emit('description', $event)"
      />
      <div v-else-if="description" class="truncate text-sm text-text-2">
        {{ description }}
      </div>
    </div>
  </component>
</template>
