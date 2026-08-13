<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';

const props = defineProps<{
  title: string;
  summary: string;
  iconMedia?: MediaDescriptor;
  href?: string;
  interactive: boolean;
  flush?: boolean;
}>();
</script>

<template>
  <component
    :is="href && interactive ? 'a' : 'div'"
    :href="href && interactive ? href : undefined"
    :target="href && interactive ? '_blank' : undefined"
    :rel="href && interactive ? 'noopener noreferrer' : undefined"
    class="flex min-h-16 w-full min-w-0 items-center gap-xs rounded-normal
      border border-border-1 bg-bg-2 text-text-1 no-underline transition-colors"
    :class="[
      {
        'cursor-pointer hocus:border-border-3 hocus:bg-bg-3':
          href && interactive,
      },
      flush ? '' : 'p-xs',
    ]"
  >
    <Media
      v-if="iconMedia"
      v-bind="iconMedia"
      class="size-12 shrink-0 rounded-sm object-cover opacity-100"
      :class="{ 'm-xs mr-0': flush }"
    />
    <span
      v-else
      class="flex size-12 shrink-0 items-center justify-center rounded-sm
        bg-bg-3 text-text-3"
      :class="{ 'm-xs mr-0': flush }"
      aria-hidden="true"
    >
      <Icon name="link" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-semibold">{{ title }}</span>
      <span class="line-clamp-2 block text-xs text-text-3">{{ summary }}</span>
    </span>
  </component>
</template>
