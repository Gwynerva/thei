<script lang="ts" setup>
import type { MediaDescriptor, MediaPlayback } from '#layers/thei/shared/media';

/**
 * Decorative media along one edge of a card or row.
 *
 * The strip spans the full height of its positioned parent; the parent's class
 * sets its width. The media fills that height with its middle at the strip's
 * focus, stays sharp through a window along the outer edge, dissolves into its
 * own blurred copy past it, and that into the parent. `fade` picks the
 * geometry for the kind of place the strip is in.
 *
 * A drawn icon stays pinned to the edge: it is a mark rather than a picture
 * with a subject, and centred it would sit under the words.
 */
const {
  media,
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
      :centred="!media.generated"
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
@reference "../styles/main.css";
/*
 * Registered so that the window can open smoothly under a pointer: an
 * unregistered custom property would jump.
 */
@property --media-edge-clear {
  syntax: '<percentage>';
  inherits: true;
  initial-value: 50%;
}

/*
 * The strip itself, blurred backdrop included, holds up to `--media-edge-hold`
 * and dissolves into the parent over the rest of its width (`mask-ease`).
 * The window of the sharp media inside it is drawn by `Media`.
 */
.media-edge-strip {
  @apply mask-ease;
  --ease-direction: var(--media-edge-inward);
  --ease-from: var(--media-edge-hold);
  --ease-to: 100%;
  transition: --media-edge-clear 300ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .media-edge-strip {
    transition: none;
  }
}
.media-edge-strip[data-side='left'] {
  --media-edge-inward: to right;
}
.media-edge-strip[data-side='right'] {
  --media-edge-inward: to left;
}
/*
 * Shares of the strip, from its outer edge: where the media's middle goes,
 * how far it stays sharp (and how far under a pointer), how long it takes to
 * dissolve after that, and how far the strip holds before fading out.
 */
.media-edge-strip[data-fade='row'] {
  --media-edge-focus: 0.45;
  --media-edge-clear: 25%;
  --media-edge-clear-open: 33%;
  --media-edge-dissolve: 65%;
  --media-edge-hold: 10%;
}
.media-edge-strip[data-fade='preview'] {
  --media-edge-focus: 0.4;
  --media-edge-clear: 28%;
  --media-edge-clear-open: 36%;
  --media-edge-dissolve: 46%;
  --media-edge-hold: 15%;
}
/* A card's strip is the whole card, its text over the inner three quarters. */
.media-edge-strip[data-fade='card'] {
  --media-edge-focus: 0.22;
  --media-edge-clear: 20%;
  --media-edge-clear-open: 28%;
  --media-edge-dissolve: 46%;
  --media-edge-hold: 15%;
}
/* The window opens a little while the card or row it is in is engaged. */
.group:is(:focus-visible, :has(:focus-visible)) .media-edge-strip {
  --media-edge-clear: var(--media-edge-clear-open);
}

@media (hover: hover) {
  .group:hover .media-edge-strip {
    --media-edge-clear: var(--media-edge-clear-open);
  }
}
</style>
