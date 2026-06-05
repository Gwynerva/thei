<script lang="ts" setup>
import type { IconName } from '#thei/icons';

defineOptions({ inheritAttrs: false });

const { icon, href } = defineProps<{
  icon?: IconName;
  href?: string;
}>();
</script>

<template>
  <a
    v-if="href"
    v-bind="$attrs"
    :href="href"
    class="flex size-12 cursor-pointer items-center justify-center rounded-full
      border-2 border-border-3/30 bg-bg-2/60 text-text-1/70
      shadow-[0_0_10px_2px_var(--color-shadow-3)] backdrop-blur transition
      hocus:border-border-3/50 hocus:bg-bg-2/80 hocus:text-text-1"
  >
    <Icon v-if="icon" :name="icon" class="size-8" />
    <slot v-else></slot>
  </a>
  <TheiLink
    v-else
    v-bind="$attrs"
    class="flex size-12 cursor-pointer items-center justify-center rounded-full
      border-2 border-border-3/30 bg-bg-2/60 text-text-1/70
      shadow-[0_0_10px_2px_var(--color-shadow-3)] backdrop-blur transition
      hocus:border-border-3/50 hocus:bg-bg-2/80 hocus:text-text-1"
  >
    <Icon v-if="icon" :name="icon" class="size-8" />
    <slot v-else></slot>
  </TheiLink>
</template>
