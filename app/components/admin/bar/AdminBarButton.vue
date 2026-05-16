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
    class="hocus:bg-gray-500/50 hocus:opacity-100 flex h-full min-w-0
      cursor-pointer items-center gap-3 px-3 opacity-80 transition"
  >
    <Icon
      v-if="icon"
      :name="icon"
      class="text-gray-300 dark:text-gray-700 shrink-0 text-2xl"
    />
    <slot v-else name="icon" />
    <span
      v-if="label"
      class="text-gray-100 dark:text-gray-900 hidden truncate sm:block"
    >
      {{ label }}
    </span>
    <slot v-else name="label" />
  </TheiLink>
</template>
