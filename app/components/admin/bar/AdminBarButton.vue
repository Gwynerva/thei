<script lang="ts" setup>
import { type IconName } from '#thei/icons';

export interface AdminBarButtonProps {
  to: string | { href: string; target?: string; external?: boolean };
  icon?: IconName;
  label?: string;
  title?: string;
}

const { label, title } = defineProps<AdminBarButtonProps>();

const alwaysTitlePopup = computed(() => {
  if (!label) return true;
  if (!title) return false;
  return title !== label;
});
</script>

<template>
  <TheiLink
    :to="typeof to === 'string' ? to : to.href"
    :target="typeof to === 'object' ? to.target : undefined"
    :external="typeof to === 'object' ? to.external : undefined"
    :thei-title-popup="title ?? label"
    :thei-title-popup-class="alwaysTitlePopup ? '' : 'sm:hidden'"
    :aria-label="title ?? label"
    class="flex h-full min-w-0 cursor-pointer items-center gap-3 px-3 opacity-80
      transition hactive:bg-gray-500/50 hactive:opacity-100"
  >
    <Icon
      v-if="icon"
      :name="icon"
      class="shrink-0 text-2xl text-gray-300 dark:text-gray-700"
    />
    <slot v-else name="icon" />
    <span
      v-if="label"
      class="hidden truncate text-gray-100 sm:block dark:text-gray-900"
    >
      {{ label }}
    </span>
    <slot v-else name="label" />
  </TheiLink>
</template>
