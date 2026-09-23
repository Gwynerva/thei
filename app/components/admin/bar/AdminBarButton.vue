<script lang="ts" setup>
import { type IconName } from '#thei/icons';

export interface AdminBarButtonProps {
  to: string | { href: string; target?: string; external?: boolean };
  title: string;
  icon?: IconName;
  label?: string;
  shrinkable?: boolean;
  /** Hides the label below `xs`, leaving the icon alone. */
  compactLabel?: boolean;
}

defineProps<AdminBarButtonProps>();
</script>

<template>
  <TheiLink
    :to="typeof to === 'string' ? to : to.href"
    :target="typeof to === 'object' ? to.target : undefined"
    :external="typeof to === 'object' ? to.external : undefined"
    :data-title-popup="title"
    :aria-label="title"
    class="flex h-full cursor-pointer items-center gap-2 bg-transparent px-2
      opacity-80 transition max-xs:gap-1.5 max-xs:px-1.5 sm:gap-3 sm:px-3
      hocus:bg-accent/25 hocus:opacity-100"
    :class="shrinkable ? 'min-w-0 shrink' : 'shrink-0'"
  >
    <Icon v-if="icon" :name="icon" class="shrink-0 text-xl max-xs:text-lg" />
    <slot v-else name="icon" />
    <span
      v-if="label"
      class="truncate"
      :class="{ 'max-xs:hidden': compactLabel }"
      >{{ label }}</span
    >
    <slot v-else name="label" />
  </TheiLink>
</template>
