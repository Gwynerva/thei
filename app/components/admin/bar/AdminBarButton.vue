<script lang="ts" setup>
import { type IconName } from '#thei/icons';

export interface AdminBarButtonProps {
  to: string | { href: string; target?: string; external?: boolean };
  icon?: IconName;
  label?: string;
  labelVisibility?: 'always' | 'auto';
  title?: string;
}

const {
  label,
  title,
  labelVisibility = 'auto',
} = defineProps<AdminBarButtonProps>();

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
    class="flex h-full min-w-0 cursor-pointer items-center gap-3 bg-transparent
      px-3 opacity-80 transition hocus:bg-accent/25 hocus:opacity-100"
  >
    <Icon v-if="icon" :name="icon" class="shrink-0 text-[1.2em]" />
    <slot v-else name="icon" />
    <span
      v-if="label"
      class="truncate"
      :class="[labelVisibility === 'always' ? '' : 'hidden sm:block']"
    >
      {{ label }}
    </span>
    <slot v-else name="label" />
  </TheiLink>
</template>
