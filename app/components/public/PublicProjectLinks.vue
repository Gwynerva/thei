<script lang="ts" setup>
import type { PublicProjectReference } from '#layers/thei/shared/api/public';

defineProps<{ projects: PublicProjectReference[] }>();
</script>

<template>
  <div v-if="projects.length" class="flex min-w-0 flex-wrap items-center gap-2">
    <TheiLink
      v-for="project in projects"
      :key="project.href"
      :to="project.href"
      :aria-label="project.title"
      :data-title-popup="project.summary"
      class="pointer-events-auto relative z-3 inline-flex max-w-full min-w-0
        items-center gap-2 rounded-sm bg-bg-3/80 py-1 pr-xs pl-1 text-sm
        font-normal text-text-2 transition focus-visible:ring-2
        focus-visible:ring-accent focus-visible:outline-none hocus:bg-accent/15
        hocus:text-accent"
    >
      <span
        class="size-5 shrink-0 overflow-hidden rounded-sm bg-bg-4 sm:size-7"
      >
        <Media v-bind="project.iconMedia" class="size-full" />
      </span>
      <span class="min-w-0 leading-snug break-words">{{ project.title }}</span>
    </TheiLink>
  </div>
</template>
