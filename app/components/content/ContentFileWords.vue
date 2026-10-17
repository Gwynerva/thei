<script lang="ts" setup>
/**
 * A file's words on its card or its row of a group, one under another: its
 * title — a field while the text is edited, else whatever the slot makes of
 * it — what the file is, for whoever cannot see it, and its facts.
 */
withDefaults(
  defineProps<{
    title: string;
    editable: boolean;
    placeholder: string;
    /** The file's description, which its window shows. */
    alt?: string;
    details: readonly string[];
  }>(),
  { alt: undefined },
);

const emit = defineEmits<{ title: [value: string] }>();
</script>

<template>
  <ContentPlainTextField
    v-if="editable"
    :model-value="title"
    :editable="true"
    :placeholder
    class="min-h-6 truncate font-semibold tracking-tight outline-none
      empty:before:pointer-events-none empty:before:text-text-3
      empty:before:content-[attr(data-placeholder)] focus:before:hidden"
    @update:model-value="emit('title', $event)"
  />
  <slot v-else />
  <span v-if="!editable && alt" class="sr-only">{{ publicText(alt) }}</span>

  <span
    v-if="details.length"
    class="flex min-w-0 items-center gap-1.5 text-xs text-text-3"
  >
    <template v-for="(detail, index) in details" :key="index">
      <span v-if="index" aria-hidden="true">·</span>
      <span class="truncate">{{ detail }}</span>
    </template>
  </span>
</template>
