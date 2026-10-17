<script lang="ts" setup>
import type {
  ContentAssetData,
  ContentMediaLayout,
} from '#layers/thei/shared/content';
import { contentMediaAutoplays } from '#layers/thei/shared/content-media';

/**
 * A picture or a video as a text lays it out, and what stands right under
 * it — its caption — as wide as it is. `framed`, the two share one frame on
 * the ground of a surface, as a gallery's picture and caption do.
 *
 * Another file in the same place changes the picture alone: what stands
 * under it stays the element it was, so a caption being written keeps the
 * caret, and the one caption of a gallery is the same element for every
 * tile. A file that has gone missing leaves its frame empty, with what
 * stands on it and under it.
 */
const props = withDefaults(
  defineProps<{
    asset: ContentAssetData;
    layout: ContentMediaLayout;
    rounded?: boolean;
    naturalSize?: boolean;
    framed?: boolean;
  }>(),
  { rounded: true, naturalSize: true, framed: false },
);

const measuredWidth = ref<number>();
const measuredHeight = ref<number>();
const media = computed(() => props.asset.media);
const width = computed(() => media.value?.width ?? measuredWidth.value);
const height = computed(() => media.value?.height ?? measuredHeight.value);
const hasDimensions = computed(() => Boolean(width.value && height.value));
const autoplay = computed(
  () =>
    media.value?.kind === 'video' && contentMediaAutoplays(props.asset.size),
);
const frameStyle = computed(() => {
  const aspectRatio = hasDimensions.value
    ? `${width.value} / ${height.value}`
    : '16 / 9';
  if (props.layout === 'centered' && hasDimensions.value)
    return { aspectRatio, maxHeight: `min(36rem, ${height.value}px)` };
  return { aspectRatio };
});
/**
 * How wide the picture and what is under it are: the column, or, as it is,
 * no wider than the picture itself, nor than a picture 36rem high would be.
 */
const boxStyle = computed(() =>
  props.layout === 'natural' && hasDimensions.value
    ? {
        width: `min(100%, ${width.value}px, calc(36rem * ${width.value} / ${height.value}))`,
      }
    : undefined,
);

// Another picture is another one to measure: nothing measured for the last
// one carries over.
watch(
  () => media.value?.src,
  () => {
    measuredWidth.value = undefined;
    measuredHeight.value = undefined;
  },
);

function rememberDimensions(nextWidth: number, nextHeight: number) {
  if (media.value?.width && media.value.height) return;
  measuredWidth.value = nextWidth;
  measuredHeight.value = nextHeight;
}
</script>

<template>
  <div
    class="min-w-0"
    :class="[
      layout === 'natural' ? 'mr-auto max-w-full' : 'w-full',
      {
        'overflow-hidden rounded-normal border border-border-1 bg-bg-2': framed,
      },
    ]"
    :style="boxStyle"
  >
    <div
      class="relative isolate w-full overflow-hidden"
      :class="{
        'max-h-144': layout !== 'stretch',
        'rounded-normal': rounded && !framed,
        'bg-bg-1': !media,
      }"
      :style="frameStyle"
      :data-content-media-layout="layout"
    >
      <!-- Another file is another picture to load: nothing loaded for the
           last one carries over. -->
      <Media
        v-if="media"
        :key="media.src"
        v-bind="media"
        :autoplay
        :loop="autoplay"
        :controls="media.kind === 'video'"
        fit="contain"
        :natural-size="naturalSize && layout !== 'stretch'"
        :backdrop="layout === 'centered'"
        :width
        :height
        class="size-full bg-bg-1"
        @dimensions="rememberDimensions"
      />
      <slot />
    </div>
    <slot name="below" />
  </div>
</template>
