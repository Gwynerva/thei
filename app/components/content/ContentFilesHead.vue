<script lang="ts" setup>
/**
 * The title heading a block of several files — a gallery, a group — a step
 * up from what it heads, as a table's head is: a field while the text is
 * edited, and there only then when the block has no title.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    editable: boolean;
    placeholder?: string;
    /** The block it heads, as its data attributes name it. */
    block: 'gallery' | 'file-group';
  }>(),
  { placeholder: '' },
);

const emit = defineEmits<{ title: [value: string] }>();

const headAttribute = computed(() => ({ [`data-${props.block}-head`]: '' }));
const titleAttribute = computed(() => ({
  [`data-${props.block}-title`]: '',
}));
</script>

<template>
  <div
    v-if="editable || title"
    class="flex min-h-10 min-w-0 items-center bg-bg-3 px-sm py-1.5"
    v-bind="headAttribute"
  >
    <ContentPlainTextField
      v-if="editable"
      :model-value="title"
      :editable="true"
      :placeholder
      class="min-h-6 min-w-0 flex-1 truncate font-semibold tracking-tight
        text-text-1 outline-none empty:before:pointer-events-none
        empty:before:text-text-3 empty:before:content-[attr(data-placeholder)]
        focus:before:hidden"
      v-bind="titleAttribute"
      @update:model-value="emit('title', $event)"
    />
    <p
      v-else
      class="min-w-0 font-semibold tracking-tight text-text-1"
      v-bind="titleAttribute"
    >
      {{ publicText(title) }}
    </p>
  </div>
</template>
