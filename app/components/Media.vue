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
  /**
   * For edge media: places the middle of the media at `--media-edge-focus`
   * of the strip instead of pinning its outer side to the edge.
   */
  centred: Boolean,
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
      'media-edge-centred': edgeFade && centred,
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
.media-edge-left {
  --media-edge-inward: to right;
}
.media-edge-right {
  --media-edge-inward: to left;
}
/*
 * Both fades below run from opaque at `--media-edge-from` to clear at
 * `--media-edge-to` along a smoothstep: a straight ramp shows where it starts
 * and where it ends, which reads as an edge.
 */
.media-edge :deep(:is(.media-foreground, .media-main)) {
  --media-edge-span: calc(var(--media-edge-to) - var(--media-edge-from));
  mask-image: linear-gradient(
    var(--media-edge-inward),
    #000 var(--media-edge-from),
    rgb(0 0 0 / 97.2%)
      calc(var(--media-edge-from) + var(--media-edge-span) * 0.1),
    rgb(0 0 0 / 89.6%)
      calc(var(--media-edge-from) + var(--media-edge-span) * 0.2),
    rgb(0 0 0 / 78.4%)
      calc(var(--media-edge-from) + var(--media-edge-span) * 0.3),
    rgb(0 0 0 / 64.8%)
      calc(var(--media-edge-from) + var(--media-edge-span) * 0.4),
    rgb(0 0 0 / 50%) calc(var(--media-edge-from) + var(--media-edge-span) * 0.5),
    rgb(0 0 0 / 35.2%)
      calc(var(--media-edge-from) + var(--media-edge-span) * 0.6),
    rgb(0 0 0 / 21.6%)
      calc(var(--media-edge-from) + var(--media-edge-span) * 0.7),
    rgb(0 0 0 / 10.4%)
      calc(var(--media-edge-from) + var(--media-edge-span) * 0.8),
    rgb(0 0 0 / 2.8%)
      calc(var(--media-edge-from) + var(--media-edge-span) * 0.9),
    transparent var(--media-edge-to)
  );
  mask-repeat: no-repeat;
}
/*
 * The window: the sharp media stays clear across the outer part of the strip
 * and dissolves into its own blurred backdrop across the rest, measured on the
 * strip whatever the media's shape.
 */
.media-edge :deep(.media-foreground) {
  --media-edge-from: var(--media-edge-clear, 50%);
  --media-edge-to: calc(
    var(--media-edge-clear, 50%) + var(--media-edge-dissolve, 50%)
  );
  container-type: size;
}
/*
 * Edge media always spans the full height of its strip. The width follows the
 * intrinsic ratio, so a strip stretched by a taller neighbour scales the media
 * up and clips it instead of letterboxing it. Its own inner side dissolves too,
 * so media narrower than the window never ends in a hard line.
 */
.media-edge :deep(.media-main) {
  --media-edge-from: 50%;
  --media-edge-to: 100%;
  --media-edge-offset: 0px;
  width: calc(100cqh * var(--media-ratio));
  max-width: none;
  height: 100%;
  object-fit: cover;
}
/*
 * Centred media puts its middle, where a picture's subject usually is, at
 * `--media-edge-focus` of the strip from the outer edge, and loses its outer
 * side past the edge for it. Media too narrow to reach the edge that way stays
 * pinned to it, so the outer edge is never left empty.
 */
.media-edge-centred :deep(.media-main) {
  --media-edge-offset: min(
    0px,
    calc(var(--media-edge-focus, 0.5) * 100cqw - 50cqh * var(--media-ratio))
  );
}
.media-edge-left :deep(.media-main) {
  inset-inline: var(--media-edge-offset) auto;
}
.media-edge-right :deep(.media-main) {
  inset-inline: auto var(--media-edge-offset);
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
