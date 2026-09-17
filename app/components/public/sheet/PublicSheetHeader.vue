<script lang="ts" setup>
import type { IconName } from '#thei/icons';

defineProps<{ title: string; icon?: IconName; expanded?: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <header
    class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-xs px-sm
      py-xs"
    :class="{ 'border-b border-border-1': expanded }"
  >
    <component
      :is="expanded ? 'h2' : 'span'"
      class="flex items-center gap-xs font-semibold"
    >
      <Icon v-if="icon" :name="icon" class="text-lg text-text-2" />
      {{ title }}
    </component>
    <span class="flex min-w-0 items-center">
      <slot name="summary" />
    </span>
    <button
      type="button"
      class="flex size-9 shrink-0 cursor-pointer items-center justify-center
        rounded-sm bg-bg-3 text-text-2 transition focus-visible:ring-2
        focus-visible:ring-accent focus-visible:outline-none hocus:bg-bg-4
        hocus:text-text-1"
      :aria-label="expanded ? phrase.close_modal : phrase.public_details_expand"
      :aria-expanded="expanded ?? false"
      @click="$emit('toggle')"
    >
      <Icon :name="expanded ? 'close' : 'expand-vertical'" />
    </button>
  </header>
</template>
