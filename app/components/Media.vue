<script lang="ts" setup>
import type { PropType } from 'vue';
import { mediaSurfaceProps } from './media-props';
import MediaSurface from './MediaSurface.vue';

const props = defineProps({
  ...mediaSurfaceProps,
  autoplay: Boolean,
  fit: {
    type: String as PropType<'cover' | 'contain' | 'height'>,
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
  '--media-fit':
    ambient.value || props.fit === 'height' ? 'contain' : props.fit,
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
      'media-height': fit === 'height',
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
.media-edge :deep(.media-main) {
  mask-image: var(--media-edge-mask);
  mask-size: min(100%, calc(100cqh * var(--media-ratio))) 100%;
  mask-position: var(--media-align);
  mask-repeat: no-repeat;
}
.media-height :deep(.media-main) {
  width: auto;
  max-width: none;
  height: 100%;
  aspect-ratio: var(--media-ratio);
  inset-inline-end: auto;
  mask-size: 100% 100%;
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
