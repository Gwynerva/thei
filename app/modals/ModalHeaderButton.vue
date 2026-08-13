<script lang="ts" setup>
import type { IconName } from '#thei/icons';

withDefaults(
  defineProps<{
    icon?: IconName;
    label: string;
    variant?: 'default' | 'delete' | 'accent';
    size?: 'default' | 'compact';
    disabled?: boolean;
  }>(),
  { variant: 'default', size: 'default', disabled: false },
);
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :aria-label="label"
    :data-title-popup="icon && !$slots.default ? label : undefined"
    class="flex shrink-0 cursor-pointer items-center justify-center gap-1
      rounded-normal text-sm font-semibold transition-colors
      disabled:cursor-auto"
    :class="{
      'h-9 px-xs': size === 'default',
      'size-7 px-0': size === 'compact',
      'bg-bg-3 text-text-2': variant !== 'accent',
      'not-disabled:hocus:bg-bg-4 not-disabled:hocus:text-text-1':
        variant === 'default',
      'not-disabled:hocus:bg-bg-error not-disabled:hocus:text-text-error':
        variant === 'delete',
      'bg-accent/80 text-white not-disabled:hocus:bg-accent':
        variant === 'accent',
      'disabled:bg-bg-accent disabled:text-text-2': variant === 'accent',
      'pointer-events-none opacity-40': disabled && size === 'compact',
      'w-9 px-0': size === 'default' && icon && !$slots.default,
    }"
  >
    <Icon v-if="icon" :name="icon" />
    <slot></slot>
  </button>
</template>
