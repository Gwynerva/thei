<script lang="ts" setup>
import type { AssetRotation } from '#layers/thei/shared/asset-crop';
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
  /**
   * A video's still, shown until it plays: its preview, or a frame chosen in
   * the browser for a file not uploaded yet. Without it a video shows its
   * first frame, which is often black.
   */
  poster?: string;
  hasAudio?: boolean;
  /** The media's size as shown: already turned when `rotation` is set. */
  displayDimensions?: { width: number; height: number };
  /** Clockwise quarter turns to show the media at. */
  rotation?: AssetRotation;
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

/**
 * A turned media element keeps its own proportions and is turned in place,
 * centred in a box that already has the turned shape; the box's size is read
 * through container units, so zoom needs nothing extra here either.
 */
const turnStyle = computed(() => {
  const rotation = props.rotation ?? 0;
  if (!rotation) return undefined;
  const sideways = rotation !== 180;
  return {
    width: sideways ? '100cqh' : '100%',
    height: sideways ? '100cqw' : '100%',
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  };
});

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
      <!-- The box is sized by the zoom; anything laid over the media (a crop
           frame) is positioned in percent of it and so follows every zoom
           and pan without knowing about them. -->
      <Transition
        enter-from-class="opacity-0"
        enter-active-class="transition-opacity duration-300
          motion-reduce:duration-0"
        leave-to-class="opacity-0"
        leave-active-class="transition-opacity motion-reduce:duration-0"
      >
        <div
          v-show="isReady"
          class="relative shrink-0"
          :class="turnStyle ? '[container-type:size]' : ''"
          :style="mediaStyle"
        >
          <video
            v-if="isVideo"
            ref="media"
            :src="sitePath(props.src)"
            :poster="props.poster && sitePath(props.poster)"
            preload="metadata"
            class="pointer-events-none block max-h-none max-w-none"
            :class="turnStyle ? 'absolute top-1/2 left-1/2' : 'size-full'"
            :style="turnStyle"
            @loadedmetadata="onVideoMeta"
          />
          <img
            v-else
            ref="media"
            :src="sitePath(props.src)"
            alt=""
            draggable="false"
            class="pointer-events-none block max-h-none max-w-none"
            :class="turnStyle ? 'absolute top-1/2 left-1/2' : 'size-full'"
            :style="turnStyle"
            @load="onImgLoad"
          />
          <slot name="overlay"></slot>
        </div>
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
