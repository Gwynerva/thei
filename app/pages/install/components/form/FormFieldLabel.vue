<script lang="ts" setup>
defineProps<{ focus?: HTMLElement | null }>();
</script>

<template>
  <div
    class="text-sm font-medium text-gray-700 dark:text-gray-300"
    @click="focus?.focus()"
  >
    <slot></slot>
  </div>
</template>
