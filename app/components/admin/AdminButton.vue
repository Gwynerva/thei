<script lang="ts" setup>
import type { IconName } from '#thei/icons';

const {
  icon,
  variant = 'normal',
  type = 'button',
  disabled,
} = defineProps<{
  icon?: IconName;
  variant?: 'normal' | 'blue';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}>();
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="flex w-full cursor-pointer items-center justify-center gap-2
      rounded-lg px-4 py-2.5 font-semibold shadow-sm disabled:cursor-not-allowed
      disabled:opacity-40"
    :class="
      variant === 'normal'
        ? `enabled:hactive:opacity-90 bg-gray-900 text-white transition-opacity
          dark:bg-white dark:text-gray-900`
        : `enabled:hactive:bg-blue-700 dark:enabled:hactive:bg-blue-600
          bg-blue-600 text-white transition-colors dark:bg-blue-500`
    "
  >
    <Icon v-if="icon" :name="icon" />
    <slot />
  </button>
</template>
