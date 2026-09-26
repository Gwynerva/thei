<script lang="ts" setup>
/**
 * The "+" that adds an item to a section, for `SectionHeader`'s action slot.
 *
 * A square icon from `sm` up, with the label as its hint. On a phone it sits
 * under the description and says what it does: a hint that only appears on
 * hover never appears on a touch screen.
 */
const {
  label,
  disabled,
  // `undefined` rather than `false` when absent, so a button that opens a
  // modal does not announce a popup it never shows expanded.
  expanded = undefined,
} = defineProps<{
  label: string;
  /** Whether the popup it opens is open; leave unset when it opens a modal. */
  expanded?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{ click: [event: MouseEvent] }>();

const element = useTemplateRef<HTMLButtonElement>('element');

defineExpose({
  element,
  focus: (options?: FocusOptions) => element.value?.focus(options),
});
</script>

<template>
  <button
    ref="element"
    type="button"
    class="flex h-10 cursor-pointer items-center justify-center gap-xs
      rounded-normal bg-bg-3 px-md text-text-2 transition-colors
      disabled:cursor-not-allowed disabled:bg-bg-3/40 disabled:text-text-3/80
      sm:size-12 sm:px-0 hocus:not-disabled:bg-bg-accent
      hocus:not-disabled:text-accent"
    :aria-label="label"
    :data-title-popup="label"
    aria-haspopup="dialog"
    :aria-expanded="expanded"
    :disabled
    @click="emit('click', $event)"
  >
    <Icon name="plus" />
    <span class="text-sm font-semibold sm:hidden" data-title-popup-label>
      {{ label }}
    </span>
  </button>
</template>
