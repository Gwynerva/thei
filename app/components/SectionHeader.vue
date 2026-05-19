<script lang="ts" setup>
import type { IconName } from '#thei/icons';

defineProps<{
  icon?: IconName;
  title?: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex flex-col gap-sm align-top sm:flex-row sm:justify-between">
    <div class="flex flex-col">
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
    <slot name="actions"></slot>
  </div>
</template>
