<script lang="ts" setup>
import type { PropType } from 'vue';
import { mediaSurfaceProps } from './media-props';
import MediaSurface from './MediaSurface.vue';

const props = defineProps({
  ...mediaSurfaceProps,
  autoplay: Boolean,
  fit: {
    type: String as PropType<'cover' | 'contain'>,
    default: 'cover',
  },
  align: {
    type: String as PropType<'left' | 'center' | 'right'>,
    default: 'center',
  },
  naturalSize: Boolean,
  variant: {
    type: String as PropType<'default' | 'ambient'>,
    default: 'default',
  },
});
const emit = defineEmits<{
  dimensions: [width: number, height: number];
  ready: [];
  error: [];
}>();
const surface = useTemplateRef<InstanceType<typeof MediaSurface>>('surface');
const ambient = computed(() => props.variant === 'ambient');
const playback = computed(
  () => props.playback ?? (props.autoplay ? 'autoplay' : 'manual'),
);
const edgeFade = computed(() => ambient.value && props.align !== 'center');
const style = computed(() => ({
  '--media-align': props.align,
  '--media-fit': ambient.value ? 'contain' : props.fit,
  '--media-edge-mask': `linear-gradient(to ${props.align === 'left' ? 'right' : 'left'}, black 50%, transparent)`,
  ...(props.naturalSize && props.width && props.height
    ? {
        '--media-natural-width': `${props.width}px`,
        '--media-natural-height': `${props.height}px`,
      }
    : {}),
}));
defineExpose({
  play: () => surface.value?.play(),
  pause: () => surface.value?.pause(),
});
</script>

<template>
  <MediaSurface
    ref="surface"
    :src
    :kind
    :preview-src
    :accent
    :width
    :height
    :alt
    :controls
    :engaged
    :suspended
    :playback
    :autoplay-reduced-motion
    :muted="muted || ambient"
    :loop="loop || ambient"
    :backdrop="backdrop || ambient"
    :style
    :class="{
      'media-edge': edgeFade,
      'media-edge-left': edgeFade && align === 'left',
      'media-edge-right': edgeFade && align === 'right',
      'media-natural': naturalSize && width && height,
    }"
    :data-media-variant="variant"
    @dimensions="(width, height) => emit('dimensions', width, height)"
    @ready="emit('ready')"
    @error="emit('error')"
  />
</template>

<style scoped>
:deep(.media-main) {
  object-fit: var(--media-fit);
  object-position: var(--media-align);
}
.media-edge :deep(.media-foreground) {
  container-type: size;
}
/*
 * Edge media always spans the full height of its strip and is pinned to its
 * edge. The width follows the intrinsic ratio, so a strip stretched by a taller
 * neighbour scales the media up and clips it on the inner side instead of
 * letterboxing it. The fade ends at whichever is narrower: the media or the
 * strip.
 */
.media-edge :deep(.media-main) {
  width: calc(100cqh * var(--media-ratio));
  max-width: none;
  height: 100%;
  object-fit: cover;
  mask-image: var(--media-edge-mask);
  mask-size: min(100%, 100cqw) 100%;
  mask-position: var(--media-align);
  mask-repeat: no-repeat;
}
.media-edge-left :deep(.media-main) {
  inset-inline: 0 auto;
}
.media-edge-right :deep(.media-main) {
  inset-inline: auto 0;
}
.media-natural :deep(.media-main) {
  inset: auto;
  top: 50%;
  left: 50%;
  width: var(--media-natural-width);
  height: var(--media-natural-height);
  max-width: 100%;
  max-height: 100%;
  transform: translate(-50%, -50%);
}
</style>
