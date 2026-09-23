<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';

/**
 * "Project stage — <project>", as a line of text above a title.
 *
 * Deliberately not a button and not a "back" arrow: the page is part of the
 * project, not a step away from it. The faint bold label says what the page
 * is; the project's icon and name after it are the one link back.
 */
defineProps<{
  parent: {
    label: string;
    href: string;
    title: string;
    iconMedia?: MediaDescriptor;
  };
}>();
</script>

<template>
  <p
    class="flex max-w-full min-w-0 items-center justify-center gap-2 text-sm
      sm:justify-start"
  >
    <span class="shrink-0 font-bold text-text-3">{{ parent.label }}</span>
    <TheiLink
      :to="parent.href"
      class="inline-flex min-w-0 items-center gap-xs rounded-sm font-semibold
        text-text-1 transition focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none hocus:text-accent"
    >
      <BeveledIcon
        :media="parent.iconMedia"
        icon="project"
        plain
        class="size-6"
      />
      <span class="min-w-0 truncate">{{ publicText(parent.title) }}</span>
    </TheiLink>
  </p>
</template>
