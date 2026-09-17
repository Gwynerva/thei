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
 */
:deep(.media-foreground) {
  bottom: auto;
  height: auto;
  aspect-ratio: 16 / 9;
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
@variant sm {
  .hero-banner {
    --banner-center: calc(
      (100% - var(--width-wide)) / 2 + var(--width-wide) * 0.65
    );
  }
  :deep(.media-pair) {
    container-type: size;
  }
  :deep(.media-foreground) {
    top: 0;
    bottom: auto;
    right: auto;
    left: var(--banner-center);
    height: 100%;
    width: auto;
    aspect-ratio: var(--media-ratio);
    transform: translateX(-50%);
    mask-image: linear-gradient(
      to right,
      transparent 0%,
      rgb(0 0 0 / 15%) 10%,
      rgb(0 0 0 / 50%) 24%,
      rgb(0 0 0 / 85%) 38%,
      black 48%,
      black 70%,
      rgb(0 0 0 / 85%) 78%,
      rgb(0 0 0 / 50%) 88%,
      rgb(0 0 0 / 15%) 96%,
      transparent 100%
    );
  }
  :deep(.media-backdrop) {
    /* Same centre as the foreground; enlarge uniformly to reach every edge. */
    --tw-blur: blur(var(--blur-3xl));
    opacity: 0.7;
    inset: auto;
    top: 50%;
    left: var(--banner-center);
    width: max(
      calc(2 * var(--banner-center) + 6 * var(--blur-3xl)),
      calc((100cqh + 6 * var(--blur-3xl)) * var(--media-ratio))
    );
    height: auto;
    aspect-ratio: var(--media-ratio);
    transform: translate(-50%, -50%);
  }
}
</style>
