<script lang="ts" setup>
import type { MediaDescriptor, MediaPlayback } from '#layers/thei/shared/media';

const props = defineProps<{
  entityType?: 'project' | 'event' | 'page';
  title: string;
  summary: string;
  iconMedia?: MediaDescriptor;
  href?: string;
  interactive: boolean;
  playback?: MediaPlayback;
  flush?: boolean;
  loop?: boolean;
  autoplayReducedMotion?: boolean;
}>();
const { engaged, events: mediaEvents } = useMediaInteraction();
</script>

<template>
  <component
    v-on="mediaEvents"
    :is="href && interactive ? 'a' : 'div'"
    :href="href && interactive ? href : undefined"
    :tabindex="
      playback === 'interaction' && !(href && interactive) ? 0 : undefined
    "
    :target="href && interactive ? '_blank' : undefined"
    :rel="href && interactive ? 'noopener noreferrer' : undefined"
    class="entity-link-preview group relative flex min-h-16 w-full min-w-0
      items-center gap-xs overflow-hidden rounded-normal border border-border-1
      bg-bg-2 text-text-1 no-underline transition-colors"
    :class="[
      {
        'cursor-pointer hocus:border-border-3 hocus:bg-bg-3':
          href && interactive,
      },
      flush ? '' : 'p-xs',
    ]"
  >
    <MediaEdge
      :media="iconMedia"
      side="right"
      fade="preview"
      :engaged
      :playback="playback ?? 'autoplay'"
      :loop
      :autoplay-reduced-motion
      class="w-40 sm:w-48"
    >
      <span class="flex size-full items-center justify-end pr-xs text-text-3">
        <Icon :name="entityType ?? 'project'" class="entity-type-icon" />
      </span>
    </MediaEdge>
    <span
      class="entity-preview-text relative z-1 min-w-0 flex-1 pr-24 sm:pr-36"
      :class="flush ? 'm-xs' : undefined"
    >
      <span
        class="flex items-center gap-1 truncate text-sm font-semibold
          sm:text-base"
        ><Icon
          :name="entityType ?? 'project'"
          class="entity-type-icon shrink-0 text-xs text-text-2"
        />{{ title }}</span
      >
      <span class="line-clamp-2 block text-sm text-text-3">{{ summary }}</span>
    </span>
  </component>
</template>

<style scoped>
.entity-link-preview:is(a) {
  text-decoration: none;
}

.entity-preview-text {
  text-shadow:
    0 0 0.5em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.12em 0.45em var(--color-bg-2);
}

.entity-type-icon {
  filter: drop-shadow(0 0 0.3em var(--color-bg-2))
    drop-shadow(0 0.08em 0.24em var(--color-bg-2));
}
</style>
