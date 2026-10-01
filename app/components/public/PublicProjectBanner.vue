<script setup lang="ts">
import type { MediaDescriptor } from '#layers/thei/shared/media';
import MediaSurface from '../MediaSurface.vue';

const props = defineProps<{ media: MediaDescriptor }>();
const measuredRatio = ref<number>();
const ratio = computed(() =>
  props.media.width && props.media.height
    ? props.media.width / props.media.height
    : (measuredRatio.value ?? 1),
);
function rememberDimensions(width: number, height: number) {
  if (!props.media.width || !props.media.height)
    measuredRatio.value = width / height;
}
</script>

<template>
  <MediaSurface
    v-bind="media"
    playback="autoplay"
    backdrop
    muted
    loop
    :style="{ '--media-ratio': ratio }"
    class="hero-banner pointer-events-none absolute! inset-0 size-full"
    aria-hidden="true"
    @dimensions="rememberDimensions"
  />
</template>

<style scoped>
@reference "../../styles/main.css";
:deep(.media-main) {
  object-fit: contain;
}
/*
 * Mobile: the sharp banner is a 16:9 band at the top that dissolves downward
 * into its own heavily blurred copy, which spans the whole hero behind the
 * text. Both halves are one MediaSurface pair, so a video stays in sync.
 * The banner always fills the band's height: a wider one loses its sides to
 * the screen edges rather than leave empty strips above and below.
 */
:deep(.media-foreground) {
  right: auto;
  bottom: auto;
  left: 50%;
  height: 56.25cqw;
  width: auto;
  aspect-ratio: var(--media-ratio);
  transform: translateX(-50%);
  mask-image: linear-gradient(
    to bottom,
    black 0%,
    black 52%,
    rgb(0 0 0 / 82%) 66%,
    rgb(0 0 0 / 50%) 80%,
    rgb(0 0 0 / 18%) 92%,
    transparent 100%
  );
}
:deep(.media-backdrop) {
  --tw-blur: blur(calc(2 * var(--blur-3xl)));
  inset: calc(-6 * var(--blur-3xl));
  width: calc(100% + 12 * var(--blur-3xl));
  height: calc(100% + 12 * var(--blur-3xl));
  opacity: 1;
}
/*
 * Wider screens: the banner is edge media along the hero's right edge, the
 * way cards show theirs (`MediaEdge`). It fills the hero's height with its
 * middle at the focus, 65% across the column, and loses its right side past
 * the edge for it; a banner too narrow to reach the edge from there is
 * pinned to it instead, so the edge never shows an empty glow. It stays
 * sharp to the end of the words and dissolves across the third of the
 * column before that into its own blurred copy, which fills the hero dimmed,
 * so the words sit on the banner's own colours rather than on black. The
 * column comes from the hero (`PublicProjectHero`); every fade is a
 * smoothstep measured on the hero, from its right edge.
 */
@variant sm {
  .hero-banner {
    --banner-focus: calc(var(--hero-column-start) + var(--hero-column) * 0.65);
    --banner-clear: calc(100cqw - var(--hero-words-end));
    --banner-width: calc(100cqh * var(--media-ratio));
    --banner-middle: max(
      var(--banner-focus),
      calc(100cqw - var(--banner-width) / 2)
    );
  }
  :deep(.media-pair) {
    container-type: size;
  }
  :deep(.media-foreground) {
    inset: 0;
    width: auto;
    height: auto;
    aspect-ratio: auto;
    transform: none;
    @apply mask-smoothstep;
    --smoothstep-direction: to left;
    --smoothstep-from: var(--banner-clear);
    --smoothstep-to: calc(var(--banner-clear) + var(--hero-column) / 3);
  }
  /* Its own left side dissolves too, so it never ends in a hard line. */
  :deep(.media-main) {
    inset: 0 auto;
    left: calc(var(--banner-middle) - var(--banner-width) / 2);
    width: var(--banner-width);
    max-width: none;
    height: 100%;
    @apply mask-smoothstep;
    --smoothstep-direction: to left;
    --smoothstep-from: 50%;
    --smoothstep-to: 100%;
  }
  :deep(.media-backdrop) {
    /* Same centre as the banner; enlarged uniformly to reach every edge. */
    --tw-blur: blur(var(--blur-3xl));
    --tw-brightness: brightness(0.6);
    opacity: 1;
    inset: auto;
    top: 50%;
    left: var(--banner-middle);
    width: max(
      calc(2 * var(--banner-middle) + 6 * var(--blur-3xl)),
      calc((100cqh + 6 * var(--blur-3xl)) * var(--media-ratio))
    );
    height: auto;
    aspect-ratio: var(--media-ratio);
    transform: translate(-50%, -50%);
  }
}
</style>
