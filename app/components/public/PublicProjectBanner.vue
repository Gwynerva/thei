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
 * Wider screens: the banner is edge media along the right edge of the
 * column the page's content keeps to, the way cards show theirs
 * (`MediaEdge`). It fills the hero's height with its middle at the focus,
 * 65% across the column, and loses its right side past the column's edge
 * for it; a banner too narrow to reach that edge from there is pinned to it
 * instead, so the edge never shows an empty glow. It is sharp from the end
 * of the words to the column's edge, dissolving across the third of the
 * column before the one and a margin's width (a sixth of the column at most)
 * before the other into its own blurred copy, which fills the hero: the
 * banner never reaches past the content, and the words sit on its own
 * colours rather than on black, under a shade the hero lays only there. The
 * column comes from the hero (`PublicProjectHero`); every fade follows
 * `mask-ease`, measured on the hero.
 */
@variant sm {
  .hero-banner {
    --banner-focus: calc(var(--hero-column-start) + var(--hero-column) * 0.65);
    --banner-release: min(var(--hero-column-start), var(--hero-column) / 6);
    --banner-width: calc(100cqh * var(--media-ratio));
    --banner-middle: max(
      var(--banner-focus),
      calc(var(--hero-column-end) - var(--banner-width) / 2)
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
    @apply mask-ease;
    --ease-direction: to right;
    --ease-rise-from: calc(var(--hero-words-end) - var(--hero-column) / 3);
    --ease-rise-to: var(--hero-words-end);
    --ease-from: calc(var(--hero-column-end) - var(--banner-release));
    --ease-to: var(--hero-column-end);
  }
  /* Its own left side dissolves too, so it never ends in a hard line. */
  :deep(.media-main) {
    inset: 0 auto;
    left: calc(var(--banner-middle) - var(--banner-width) / 2);
    width: var(--banner-width);
    max-width: none;
    height: 100%;
    @apply mask-ease;
    --ease-direction: to left;
    --ease-from: 50%;
    --ease-to: 100%;
  }
  :deep(.media-backdrop) {
    /* Same centre as the banner; enlarged uniformly to reach every edge. */
    --tw-blur: blur(var(--blur-3xl));
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
