<script lang="ts" setup>
import type { IconName } from '#thei/icons';

withDefaults(
  defineProps<{
    icon?: IconName;
    label: string;
    variant?: 'default' | 'delete' | 'accent';
    disabled?: boolean;
  }>(),
  { variant: 'default', disabled: false },
);
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :aria-label="label"
    :data-title-popup="icon && !$slots.default ? label : undefined"
    class="flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1
      rounded-normal px-xs text-sm font-semibold transition-colors
      disabled:cursor-auto disabled:bg-bg-accent disabled:text-text-2"
    :class="{
      'bg-bg-3 text-text-2 hocus:bg-bg-4 hocus:text-text-1':
        variant === 'default',
      'bg-bg-3 text-text-2 hocus:bg-bg-error hocus:text-text-error':
        variant === 'delete',
      'bg-accent/80 text-white not-disabled:hocus:bg-accent':
        variant === 'accent',
      'w-9 px-0': icon && !$slots.default,
    }"
  >
    <Icon v-if="icon" :name="icon" />
    <slot></slot>
  </button>
</template>
