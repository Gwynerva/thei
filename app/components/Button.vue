<script lang="ts" setup>
defineProps<{ secondary?: boolean }>();
</script>

<template>
  <button
    class="cursor-pointer rounded-normal px-sm py-xs text-sm transition
      disabled:cursor-not-allowed"
    :class="
      secondary
        ? `bg-bg-3 text-text-2 disabled:bg-bg-3/40 disabled:text-text-3/80
          hocus:not-disabled:bg-accent/25 hocus:not-disabled:text-accent`
        : `bg-accent/80 text-white disabled:bg-accent/14 disabled:text-text-3
          hocus:not-disabled:bg-accent`
    "
  >
    <slot></slot>
  </button>
</template>
