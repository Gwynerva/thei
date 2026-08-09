<script lang="ts" setup>
import type { IconName } from '#thei/icons';

defineProps<{ title: string; icon?: IconName }>();
</script>

<template>
  <div class="flex min-w-0 items-center gap-xs text-text-2">
    <Icon v-if="icon" :name="icon" class="shrink-0" />
    <span class="min-w-0 truncate font-semibold tracking-tight">{{ title }}</span>
    <slot></slot>
  </div>
</template>
