<script lang="ts" setup>
/**
 * The owner's note on a link, the last line of the card of what the link
 * opens: why it is there. It is set off from the target's own words by a
 * faint hairline and in italics, so it never reads as the page's description
 * — nor as a diary entry's opening lines, which are italic too.
 *
 * The editor writes it in place, where it is an optional last line of the
 * card; anywhere else a card without a note shows nothing here.
 */
defineProps<{
  note?: string;
  editable?: boolean;
  placeholder?: string;
}>();
const emit = defineEmits<{ 'update:note': [value: string] }>();
</script>

<template>
  <ContentPlainTextField
    v-if="editable"
    :model-value="note"
    :editable="true"
    :placeholder
    class="block min-h-5 border-t border-border-1/50 pt-1 text-text-2 italic
      outline-none empty:before:pointer-events-none empty:before:text-text-3
      empty:before:content-[attr(data-placeholder)] focus:before:hidden"
    @update:model-value="emit('update:note', $event)"
  />
  <span
    v-else-if="note"
    class="block border-t border-border-1/50 pt-1 text-text-2 italic"
    >{{ publicText(note) }}</span
  >
</template>
