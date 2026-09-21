<script lang="ts" setup>
import {
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import AssetModalVideoControls from './AssetModalVideoControls.vue';
import { useMediaControls } from './media-controls';
import { useVideoPlayback } from './use-video-playback';

const props = defineProps<{
  extension: string;
  src: string;
  hasAudio?: boolean;
  displayDimensions?: { width: number; height: number };
}>();

const isVideo = isExtensionAllowed(props.extension, videoExtensionProfile);

const {
  transformStyle,
  mediaStyle,
  zoomPercent,
  isDraggable,
  isDragging,
  isReady,
  handleZoomButtonClick,
  resetView,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  initMedia,
  onMediaLoaded,
} = useMediaControls();

const containerRef = useTemplateRef<HTMLElement>('container');
const mediaRef = useTemplateRef<HTMLVideoElement | HTMLImageElement>('media');
const displayDimensionsKey = computed(() =>
  props.displayDimensions
    ? `${props.displayDimensions.width}x${props.displayDimensions.height}`
    : '',
);

const { state: playback, controller: playbackController } = useVideoPlayback();

watch(
  mediaRef,
  (media) => {
    playbackController.attach(
      isVideo && media instanceof HTMLVideoElement ? media : null,
    );
  },
  { flush: 'post', immediate: true },
);

useSpacePlaybackToggle(
  () => containerRef.value,
  () => playbackController.togglePlay(),
  () => isVideo && isReady.value,
);

watch(
  displayDimensionsKey,
  () => {
    if (!props.displayDimensions) return;
    onMediaLoaded(
      props.displayDimensions.width,
      props.displayDimensions.height,
    );
    resetView();
  },
  { flush: 'post' },
);

onMounted(() => {
  const container = containerRef.value;
  const media = mediaRef.value;
  if (!container) return;

  initMedia(container, () => {
    if (!media) return null;
    if (props.displayDimensions) {
      return {
        w: props.displayDimensions.width,
        h: props.displayDimensions.height,
      };
    }
    if (isVideo) {
      const video = media as HTMLVideoElement;
      return video.videoWidth > 0
        ? { w: video.videoWidth, h: video.videoHeight }
        : null;
    }

    const img = media as HTMLImageElement;
    return img.naturalWidth > 0
      ? { w: img.naturalWidth, h: img.naturalHeight }
      : null;
  });
});

function onImgLoad(e: Event): void {
  if (props.displayDimensions) {
    onMediaLoaded(
      props.displayDimensions.width,
      props.displayDimensions.height,
    );
    return;
  }

  const img = e.target as HTMLImageElement;
  if (props.extension === 'svg') {
    onMediaLoaded(0, 0);
    return;
  }

  onMediaLoaded(img.naturalWidth, img.naturalHeight);
}

function onVideoMeta(e: Event): void {
  const video = e.target as HTMLVideoElement;
  onMediaLoaded(
    props.displayDimensions?.width ?? video.videoWidth,
    props.displayDimensions?.height ?? video.videoHeight,
  );
}

defineExpose({
  zoomPercent,
  handleZoomButtonClick,
  resetView,
});
</script>

<template>
  <div
    ref="container"
    class="relative size-full overflow-hidden select-none"
    :style="{
      touchAction: 'none',
      cursor: isDragging ? 'grabbing' : isDraggable ? 'grab' : 'default',
    }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <div
      class="absolute inset-0 flex items-center justify-center"
      :style="{ transform: transformStyle, willChange: 'transform' }"
    >
      <Transition
        enter-from-class="opacity-0"
        enter-active-class="transition-opacity duration-300
          motion-reduce:duration-0"
        leave-to-class="opacity-0"
        leave-active-class="transition-opacity motion-reduce:duration-0"
      >
        <video
          v-if="isVideo"
          v-show="isReady"
          ref="media"
          :src="sitePath(props.src)"
          class="pointer-events-none block max-h-none max-w-none"
          :style="mediaStyle"
          @loadedmetadata="onVideoMeta"
        />
      </Transition>
      <Transition
        enter-from-class="opacity-0"
        enter-active-class="transition-opacity duration-300
          motion-reduce:duration-0"
        leave-to-class="opacity-0"
        leave-active-class="transition-opacity motion-reduce:duration-0"
      >
        <img
          v-if="!isVideo"
          v-show="isReady"
          ref="media"
          :src="sitePath(props.src)"
          alt=""
          draggable="false"
          class="pointer-events-none block max-h-none max-w-none"
          :style="mediaStyle"
          @load="onImgLoad"
        />
      </Transition>
    </div>

    <TransitionFade>
      <div
        v-if="!isReady"
        class="pointer-events-none absolute inset-0 flex items-center
          justify-center"
      >
        <Icon name="loading" class="text-7xl text-text-2" />
      </div>
    </TransitionFade>

    <AssetModalVideoControls
      v-if="isVideo && isReady"
      :is-paused="playback.paused"
      :current-time="playback.currentTime"
      :duration="playback.duration"
      :is-muted="playback.muted"
      :volume="playback.volume"
      :has-audio="hasAudio"
      @toggle-play="playbackController.togglePlay()"
      @seek="playbackController.seek($event)"
      @toggle-mute="playbackController.toggleMute()"
      @volume="playbackController.setVolume($event)"
    />
  </div>
</template>
