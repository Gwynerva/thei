<script setup lang="ts">
import type { PublicEntitySummary } from '#layers/thei/shared/api/public';
defineProps<{
  kind: 'project' | 'event';
  count: number;
  items: PublicEntitySummary[];
}>();
</script>
<template>
  <div
    v-if="count > 0"
    class="flex items-center justify-center gap-sm sm:contents"
  >
    <div
      v-if="items.length"
      class="flex -space-x-2 sm:self-center sm:justify-self-end"
    >
      <TheiLink
        v-for="item in items"
        :key="item.href"
        :to="item.href"
        :aria-label="item.title"
        :data-title-popup="item.title"
        class="relative block size-9 shrink-0 overflow-hidden rounded-normal
          border-2 border-bg-2 bg-bg-accent transition hocus:z-1
          hocus:-translate-y-1"
        ><Media
          v-if="item.media"
          v-bind="item.media"
          :playback="kind === 'project' ? 'autoplay' : undefined"
          :autoplay-reduced-motion="kind === 'project'"
          :loop="kind === 'project'"
          :muted="kind === 'project'"
          class="size-full" /><span
          v-else
          class="flex size-full items-center justify-center text-accent"
          ><Icon :name="kind" /></span
      ></TheiLink>
    </div>
    <TheiLink
      :to="kind === 'project' ? '/projects/' : '/life/'"
      class="justify-self-start text-sm font-bold text-text-2 tabular-nums
        transition-colors sm:self-center hocus:text-accent"
      ><span>{{
        kind === 'project' ? phrase.x_projects(count) : phrase.x_events(count)
      }}</span></TheiLink
    >
  </div>
</template>
