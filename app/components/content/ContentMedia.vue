<script lang="ts" setup>
import type {
  ContentAssetData,
  ContentMediaLayout,
} from '#layers/thei/shared/content';
import { contentMediaAutoplays } from '#layers/thei/shared/content-media';

const props = defineProps<{
  asset: ContentAssetData;
  layout: ContentMediaLayout;
  alt?: string;
}>();

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
  if (props.layout === 'stretch') return { aspectRatio };
  if (props.layout === 'centered') {
    return {
      aspectRatio,
      ...(hasDimensions.value
        ? { maxHeight: `min(36rem, ${height.value}px)` }
        : {}),
    };
  }
  if (!hasDimensions.value) return { aspectRatio, width: '100%' };
  return {
    aspectRatio,
    width: `min(100%, ${width.value}px, calc(36rem * ${width.value} / ${height.value}))`,
  };
});

function rememberDimensions(nextWidth: number, nextHeight: number) {
  if (media.value?.width && media.value.height) return;
  measuredWidth.value = nextWidth;
  measuredHeight.value = nextHeight;
}
</script>

<template>
  <div
    v-if="media"
    class="overflow-hidden rounded-normal"
    :class="[
      layout === 'natural' ? 'mr-auto max-w-full' : 'w-full',
      { 'max-h-144': layout !== 'stretch' },
    ]"
    :style="frameStyle"
    :data-content-media-layout="layout"
  >
    <Media
      v-bind="media"
      :autoplay
      :loop="autoplay"
      :controls="media.kind === 'video'"
      fit="contain"
      :natural-size="layout !== 'stretch'"
      :backdrop="layout === 'centered'"
      :width
      :height
      :alt
      class="size-full"
      @dimensions="rememberDimensions"
    />
  </div>
</template>
