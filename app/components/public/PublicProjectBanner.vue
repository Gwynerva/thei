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
    class="hero-banner pointer-events-none aspect-video w-full sm:absolute
      sm:inset-0 sm:aspect-auto sm:size-full"
    aria-hidden="true"
    @dimensions="rememberDimensions"
  />
</template>

<style scoped>
@reference "../../styles/main.css";
.hero-banner {
  opacity: 0.94;
  mask-image: linear-gradient(to bottom, black 65%, transparent);
}
:deep(.media-main) {
  object-fit: contain;
}
@variant sm {
  .hero-banner {
    --banner-center: calc(
      (100% - var(--width-wide)) / 2 + var(--width-wide) * 0.65
    );
    opacity: 1;
    mask-image: none;
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
