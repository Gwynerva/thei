<script lang="ts" setup>
import type { IconName } from '#thei/icons';

defineProps<{ icon: IconName; title: string; description?: string }>();
</script>

<template>
  <div
    class="flex flex-col items-center gap-xs rounded-normal border border-dashed
      border-border-2 bg-bg-2/60 p-lg text-center"
  >
    <span
      class="flex size-14 items-center justify-center rounded-full bg-bg-3
        text-2xl text-text-3"
    >
      <Icon :name="icon" />
    </span>
    <strong>{{ title }}</strong>
    <p v-if="description" class="max-w-128 text-sm text-text-2">
      {{ description }}
    </p>
  </div>
</template>
