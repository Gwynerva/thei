<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { MediaDescriptor } from '#layers/thei/shared/media';

defineProps<{
  icon: IconName;
  title: string;
  description?: string;
  iconMedia?: MediaDescriptor;
  backLink?: {
    href: string;
    title: string;
    iconMedia?: MediaDescriptor;
  };
}>();
</script>

<template>
  <header class="flex max-w-192 flex-col items-start">
    <TheiLink
      v-if="backLink"
      :to="backLink.href"
      class="mb-md inline-flex max-w-full items-center gap-xs text-base
        font-semibold text-text-2 transition focus-visible:ring-2
        focus-visible:ring-accent hocus:text-accent"
    >
      <Icon name="chevron-left" class="shrink-0 text-xl" />
      <span
        class="flex size-8 shrink-0 items-center justify-center overflow-hidden
          rounded-sm bg-bg-3"
      >
        <Media
          v-if="backLink.iconMedia"
          v-bind="backLink.iconMedia"
          class="size-full"
        />
        <Icon v-else name="project" />
      </span>
      <span class="truncate">{{ backLink.title }}</span>
    </TheiLink>
    <div class="flex min-w-0 items-center gap-xs sm:gap-sm">
      <span
        v-if="iconMedia"
        class="size-12 shrink-0 overflow-hidden rounded-normal bg-bg-3
          sm:size-14"
      >
        <Media v-bind="iconMedia" class="size-full" />
      </span>
      <Icon
        v-else
        :name="icon"
        class="shrink-0 text-2xl text-text-3 sm:text-3xl"
      />
      <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">{{ title }}</h1>
    </div>
    <p
      v-if="description"
      class="mt-xs text-base leading-relaxed text-text-2 sm:text-lg"
    >
      {{ description }}
    </p>
    <slot></slot>
  </header>
</template>
