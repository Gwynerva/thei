<script lang="ts" setup>
import type { IconName } from '#thei/icons';

/**
 * A section's title, with an optional action beside it — usually
 * `SectionAddButton`.
 *
 * From `sm` up the action sits to the right of the text. On a phone the
 * header is centred, so the action moves under the description instead of
 * squeezing it into a column, and there it can carry a visible label.
 */
defineProps<{
  icon?: IconName;
  title?: string;
  description?: string;
}>();

defineSlots<{ action?: () => unknown }>();
</script>

<template>
  <div
    class="flex flex-col gap-sm align-top sm:flex-row sm:items-center
      sm:justify-between sm:gap-md"
  >
    <div class="flex min-w-0 flex-col sm:flex-1">
      <div
        class="flex flex-col items-center justify-center gap-xs text-lg
          font-semibold text-text-2 sm:flex-row sm:justify-start"
      >
        <Icon v-if="icon" :name="icon" />
        <h2 v-if="title" class="text-center sm:text-left">{{ title }}</h2>
      </div>
      <p v-if="description" class="text-center text-text-3 sm:text-left">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.action" class="flex shrink-0 justify-center">
      <slot name="action"></slot>
    </div>
  </div>
</template>
