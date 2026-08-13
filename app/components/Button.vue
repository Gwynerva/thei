<script lang="ts" setup>
const { variant = 'primary', size = 'default' } = defineProps<{
  variant?: 'primary' | 'secondary' | 'delete';
  size?: 'default' | 'icon';
}>();

const variantClasses = {
  primary: `bg-accent/80 text-white
    disabled:bg-accent/14 disabled:text-text-3
    hocus:not-disabled:bg-accent`,
  secondary: `bg-bg-3 text-text-2
    disabled:bg-bg-3/40 disabled:text-text-3/80
    hocus:not-disabled:bg-accent/25 hocus:not-disabled:text-accent`,
  delete: `bg-bg-3 text-text-2 hocus:not-disabled:text-text-error
    disabled:bg-bg-3/40 disabled:text-text-3/80
    hocus:not-disabled:bg-bg-error`,
};
</script>

<template>
  <button
    class="cursor-pointer rounded-normal text-sm transition
      disabled:cursor-not-allowed"
    :class="[
      variantClasses[variant],
      size === 'icon'
        ? 'flex size-9 shrink-0 items-center justify-center p-1 text-base'
        : 'px-sm py-xs',
    ]"
  >
    <slot></slot>
  </button>
</template>
