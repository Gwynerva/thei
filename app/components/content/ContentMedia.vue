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
 */
const props = withDefaults(
  defineProps<{
    asset: ContentAssetData;
    layout: ContentMediaLayout;
    alt?: string;
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

function rememberDimensions(nextWidth: number, nextHeight: number) {
  if (media.value?.width && media.value.height) return;
  measuredWidth.value = nextWidth;
  measuredHeight.value = nextHeight;
}
</script>

<template>
  <div
    v-if="media"
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
      }"
      :style="frameStyle"
      :data-content-media-layout="layout"
    >
      <Media
        v-bind="media"
        :autoplay
        :loop="autoplay"
        :controls="media.kind === 'video'"
        fit="contain"
        :natural-size="naturalSize && layout !== 'stretch'"
        :backdrop="layout === 'centered'"
        :width
        :height
        :alt="alt ?? media.alt"
        class="size-full bg-bg-1"
        @dimensions="rememberDimensions"
      />
      <slot />
    </div>
    <slot name="below" />
  </div>
</template>
