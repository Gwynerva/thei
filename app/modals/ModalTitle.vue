<script lang="ts" setup>
import type { IconName } from '#thei/icons';

defineProps<{ title: string; icon?: IconName }>();
</script>

<template>
  <!-- A title cut short is read whole in its hint. -->
  <div
    class="flex min-w-0 items-center gap-xs text-text-2"
    :data-title-popup="title"
    data-title-popup-clipped
  >
    <Icon v-if="icon" :name="icon" class="shrink-0" />
    <span
      class="min-w-0 truncate font-semibold tracking-tight"
      data-title-popup-clip
      >{{ title }}</span
    >
    <slot></slot>
  </div>
</template>
