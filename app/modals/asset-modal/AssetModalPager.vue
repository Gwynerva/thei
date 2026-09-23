<script lang="ts" setup>
/**
 * "3 of 12" between two arrows, for a viewer showing one of several files.
 *
 * Dressed exactly like the round buttons across the viewer — the same glass,
 * border and shadow — and stretched into a pill only because it holds three
 * things instead of one.
 */
const { index, count } = defineProps<{ index: number; count: number }>();
const emit = defineEmits<{ previous: []; next: [] }>();
</script>

<template>
  <div
    class="flex h-12 items-center rounded-full border-2 border-border-3/30
      bg-bg-2/60 text-text-1/70 shadow-lg shadow-shadow-3 backdrop-blur"
    role="group"
    :aria-label="phrase.asset_pager(index + 1, count)"
  >
    <button
      type="button"
      class="flex h-full w-11 cursor-pointer items-center justify-center
        rounded-l-full transition hocus:text-text-1"
      :aria-label="phrase.asset_previous"
      @click="emit('previous')"
    >
      <Icon name="chevron-left" class="size-7" />
    </button>
    <span class="px-1 text-sm font-bold whitespace-nowrap tabular-nums">
      {{ phrase.asset_pager(index + 1, count) }}
    </span>
    <button
      type="button"
      class="flex h-full w-11 cursor-pointer items-center justify-center
        rounded-r-full transition hocus:text-text-1"
      :aria-label="phrase.asset_next"
      @click="emit('next')"
    >
      <Icon name="chevron-right" class="size-7" />
    </button>
  </div>
</template>
