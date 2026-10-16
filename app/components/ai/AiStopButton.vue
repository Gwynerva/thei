<script lang="ts" setup>
/**
 * Stops a session answering: an icon alone, in the accent, beside what it
 * stops — the words being written, or a session in a list.
 */
</script>

<template>
  <button
    type="button"
    class="flex size-9 shrink-0 cursor-pointer items-center justify-center
      bg-transparent text-accent transition-opacity pointer-coarse:size-11
      hocus:opacity-75"
    :aria-label="phrase.ai_stop"
    :data-title-popup="phrase.ai_stop"
  >
    <Icon name="pause-circle" />
  </button>
</template>
