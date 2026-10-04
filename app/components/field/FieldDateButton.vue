<script lang="ts" setup>
import type { IconName } from '#thei/icons';

/**
 * A date or a period shown as a field: it looks like the inputs around it,
 * and a click opens whatever picks it — a calendar popup, the calendar step
 * of one. Without a value it shows its label, as a placeholder would.
 */
const { icon = 'calendar' } = defineProps<{
  /** Names the field for assistive technology and stands in for a value. */
  label: string;
  /** The value as the field shows it, already formatted. */
  text?: string;
  icon?: IconName;
  /** Colours the value and its icon, such as the tone of a doubtful date. */
  tone?: string;
}>();
</script>

<template>
  <button
    type="button"
    data-label-focus
    class="flex w-full cursor-pointer items-center gap-xs rounded-normal
      border-2 border-border-1 bg-bg-1 p-xs text-left text-text-1 transition
      focus-visible:border-border-3 focus-visible:outline-none
      hocus:border-border-3"
    :aria-label="label"
  >
    <Icon :name="icon" class="shrink-0" :class="text ? tone : 'text-text-3'" />
    <span class="min-w-0 truncate" :class="text ? tone : 'text-text-3'">
      {{ text || label }}
    </span>
  </button>
</template>
