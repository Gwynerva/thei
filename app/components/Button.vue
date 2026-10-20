<script lang="ts" setup>
import type { RouteLocationRaw } from 'vue-router';
import TheiLink from './TheiLink';

const {
  variant = 'primary',
  size = 'default',
  dragHandle = false,
  to,
} = defineProps<{
  /** `raised`: a neutral one on a `bg-bg-3` ground, a card's footer. */
  variant?: 'primary' | 'secondary' | 'raised' | 'delete';
  size?: 'default' | 'icon-overlay' | 'icon-sm' | 'icon' | 'icon-lg';
  dragHandle?: boolean;
  /**
   * Where it leads: a link that looks as the button of its rank does, so a
   * way somewhere never draws a button of its own.
   */
  to?: RouteLocationRaw;
}>();

// A button whose popup is open looks as it does under the pointer, for as
// long as the popup is.
const variantClasses = {
  primary: `bg-accent/80 text-white
    off:bg-accent/14 off:text-text-3
    hocus:not-off:bg-accent popup-open:bg-accent`,
  secondary: `bg-bg-3 text-text-2
    off:bg-bg-3/40 off:text-text-3/80
    hocus:not-off:bg-accent/25 hocus:not-off:text-accent
    popup-open:bg-accent/25 popup-open:text-accent`,
  raised: `bg-bg-4 text-text-2
    off:bg-bg-4/40 off:text-text-3/80
    hocus:not-off:bg-accent/25 hocus:not-off:text-accent
    popup-open:bg-accent/25 popup-open:text-accent`,
  delete: `bg-bg-3 text-text-2 hocus:not-off:text-text-error
    off:bg-bg-3/40 off:text-text-3/80
    hocus:not-off:bg-bg-error
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
  <component
    :is="to ? TheiLink : 'button'"
    :to
    class="text-sm transition-colors disabled:cursor-not-allowed
      aria-disabled:cursor-default"
    :class="[
      variantClasses[variant],
      sizeClasses[size],
      dragHandle ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
    ]"
  >
    <slot></slot>
  </component>
</template>
