<script lang="ts" setup>
import type { Component } from 'vue';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

/**
 * A card whose picture fills it from the right edge and dissolves towards
 * the words on the left: a related entity, a section, a search result.
 *
 * The shell is the same for all of them: the card's ground and border, and a
 * shade that lifts under the pointer or the keyboard's focus and takes the
 * picture's accent (`--card-accent`), the picture brightening with it. What
 * the card says is the default slot, laid over the picture with a halo of the
 * card's ground (`text-halo-bg-2`); `fallback` stands where there is no
 * picture. `as` is what the card is: a link itself, or an element holding
 * one.
 */
const {
  media,
  as = 'div',
  interactive = true,
} = defineProps<{
  media?: MediaDescriptor;
  as?: string | Component;
  /** Lifts and takes its accent under the pointer or the keyboard's focus. */
  interactive?: boolean;
  loop?: boolean;
  muted?: boolean;
}>();

const { engaged, events: mediaEvents } = useMediaInteraction();
const accent = computed(() =>
  imageAccentCssColor(media?.accent, 'var(--color-accent)'),
);
</script>

<template>
  <component
    :is="as"
    v-on="mediaEvents"
    class="group relative isolate flex min-w-0 overflow-hidden rounded-normal
      border border-border-1 bg-bg-2 text-text-1 no-underline shadow-md
      shadow-shadow-1"
    :class="{
      [`media-edge-card-interactive transition focus-visible:ring-2
      focus-visible:ring-accent focus-visible:outline-none
      has-focus-visible:shadow-lg motion-safe:has-focus-visible:-translate-y-px
      hocus:shadow-lg motion-safe:hocus:-translate-y-px`]: interactive,
    }"
    :style="{
      '--card-accent': accent,
      '--card-shadow': `color-mix(in oklab, ${accent} 26%, transparent)`,
    }"
  >
    <MediaEdge
      :media
      side="right"
      fade="card"
      playback="interaction"
      :engaged
      :loop
      :muted
      media-class="opacity-75 transition duration-300 group-hocus:opacity-90
        group-has-focus-visible:opacity-90 motion-reduce:duration-150"
      class="w-full"
      data-card-media
    >
      <slot name="fallback" />
    </MediaEdge>
    <slot />
  </component>
</template>

<style scoped>
.media-edge-card-interactive:is(:focus-visible, :has(:focus-visible)) {
  border-color: var(--card-accent);
  --tw-shadow-color: var(--card-shadow);
}

@media (hover: hover) {
  .media-edge-card-interactive:hover {
    border-color: var(--card-accent);
    --tw-shadow-color: var(--card-shadow);
  }
}
</style>
