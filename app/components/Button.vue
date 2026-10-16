<script lang="ts" setup>
const {
  variant = 'primary',
  size = 'default',
  dragHandle = false,
} = defineProps<{
  variant?: 'primary' | 'secondary' | 'delete';
  size?: 'default' | 'icon-overlay' | 'icon-sm' | 'icon' | 'icon-lg';
  dragHandle?: boolean;
}>();

// A button whose popup is open looks as it does under the pointer, for as
// long as the popup is.
const variantClasses = {
  primary: `bg-accent/80 text-white
    disabled:bg-accent/14 disabled:text-text-3
    hocus:not-disabled:bg-accent popup-open:bg-accent`,
  secondary: `bg-bg-3 text-text-2
    disabled:bg-bg-3/40 disabled:text-text-3/80
    hocus:not-disabled:bg-accent/25 hocus:not-disabled:text-accent
    popup-open:bg-accent/25 popup-open:text-accent`,
  delete: `bg-bg-3 text-text-2 hocus:not-disabled:text-text-error
    disabled:bg-bg-3/40 disabled:text-text-3/80
    hocus:not-disabled:bg-bg-error
    popup-open:bg-bg-error popup-open:text-text-error`,
};

const sizeClasses = {
  default: 'rounded-normal px-sm py-xs',
  'icon-overlay':
    'flex size-6 shrink-0 items-center justify-center rounded-full p-0 text-sm',
  'icon-sm':
    'flex size-8 shrink-0 items-center justify-center rounded-normal p-1 text-base',
  icon: `flex size-9 shrink-0 items-center justify-center rounded-normal p-1
    text-base`,
  'icon-lg':
    'flex size-10 shrink-0 items-center justify-center rounded-normal p-1 text-base',
};
</script>

<template>
  <button
    class="text-sm transition-colors disabled:cursor-not-allowed"
    :class="[
      variantClasses[variant],
      sizeClasses[size],
      dragHandle ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
    ]"
  >
    <slot></slot>
  </button>
</template>
