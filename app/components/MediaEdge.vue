<script lang="ts" setup>
import type { MediaDescriptor, MediaPlayback } from '#layers/thei/shared/media';

/**
 * Decorative media pinned to one edge of a card or row.
 *
 * The strip spans the full height of its positioned parent; the parent's class
 * sets its width. The media fills that height and dissolves toward the inner
 * side. `fade` picks how early it dissolves, and a parent may still tune the
 * gradient through the `--media-edge-*` custom properties.
 */
const {
  side = 'left',
  fade = 'row',
  mediaClass = 'opacity-75 transition group-hocus:opacity-100',
} = defineProps<{
  media?: MediaDescriptor;
  side?: 'left' | 'right';
  fade?: 'row' | 'preview' | 'card';
  playback?: MediaPlayback;
  engaged?: boolean;
  loop?: boolean;
  muted?: boolean;
  autoplayReducedMotion?: boolean;
  mediaClass?: string;
}>();
</script>

<template>
  <span
    class="media-edge-strip pointer-events-none absolute inset-y-0"
    :class="side === 'left' ? 'left-0' : 'right-0'"
    :data-fade="fade"
    :data-side="side"
    aria-hidden="true"
  >
    <Media
      v-if="media"
      v-bind="media"
      variant="ambient"
      :align="side"
      :playback
      :engaged
      :loop
      :muted
      :autoplay-reduced-motion
      class="size-full"
      :class="mediaClass"
    />
    <slot v-else />
  </span>
</template>

<style scoped>
.media-edge-strip {
  /* A directional reveal mask cannot be represented by a semantic utility. */
  mask-image: linear-gradient(
    var(--media-edge-direction),
    rgb(0 0 0 / var(--media-edge-start-alpha, 100%)) 0%,
    rgb(0 0 0 / var(--media-edge-strong-alpha, var(--fade-strong-alpha)))
      var(--media-edge-strong, var(--fade-strong)),
    rgb(0 0 0 / var(--media-edge-soft-alpha, var(--fade-soft-alpha)))
      var(--media-edge-soft, var(--fade-soft)),
    transparent var(--media-edge-end, 100%)
  );
}
.media-edge-strip[data-side='left'] {
  --media-edge-direction: to right;
}
.media-edge-strip[data-side='right'] {
  --media-edge-direction: to left;
}
.media-edge-strip[data-fade='row'] {
  --fade-strong-alpha: 70%;
  --fade-strong: 20%;
  --fade-soft-alpha: 10%;
  --fade-soft: 75%;
}
.media-edge-strip[data-fade='preview'] {
  --fade-strong-alpha: 90%;
  --fade-strong: 45%;
  --fade-soft-alpha: 25%;
  --fade-soft: 78%;
}
.media-edge-strip[data-fade='card'] {
  --fade-strong-alpha: 72%;
  --fade-strong: 38%;
  --fade-soft-alpha: 12%;
  --fade-soft: 76%;
}
</style>
