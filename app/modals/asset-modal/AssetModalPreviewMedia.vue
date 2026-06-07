<script lang="ts" setup>
import {
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import AssetModalVideoControls from './AssetModalVideoControls.vue';
import { useMediaControls } from './media-controls';

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

const isPaused = ref(true);
const currentTime = ref(0);
const duration = ref(0);
const isMuted = ref(false);
const volume = ref(1);
const hasAudio = ref(props.hasAudio ?? true);

watch(
  () => props.hasAudio,
  (value) => {
    if (value !== undefined) hasAudio.value = value;
  },
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

function togglePlay(): void {
  const video = mediaRef.value as HTMLVideoElement;
  if (isPaused.value) {
    void video.play();
  } else {
    video.pause();
  }
}

function seek(value: number): void {
  currentTime.value = value;
  (mediaRef.value as HTMLVideoElement).currentTime = value;
}

function toggleMute(): void {
  const video = mediaRef.value as HTMLVideoElement;
  video.muted = !video.muted;
}

function onVolumeSlider(value: number): void {
  const video = mediaRef.value as HTMLVideoElement;
  video.volume = value;
  if (value > 0 && video.muted) video.muted = false;
  else if (value === 0 && !video.muted) video.muted = true;
}

function onVideoVolumeChange(e: Event): void {
  const video = e.target as HTMLVideoElement;
  isMuted.value = video.muted;
  volume.value = video.volume;
}

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
  duration.value = video.duration;
  hasAudio.value = props.hasAudio ?? true;
}

function onDurationChange(e: Event): void {
  duration.value = (e.target as HTMLVideoElement).duration;
}

function onTimeUpdate(e: Event): void {
  currentTime.value = (e.target as HTMLVideoElement).currentTime;
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
      <TransitionFade>
        <video
          v-if="isVideo"
          v-show="isReady"
          ref="media"
          :src="props.src"
          class="pointer-events-none block max-h-none max-w-none"
          :style="mediaStyle"
          @loadedmetadata="onVideoMeta"
          @durationchange="onDurationChange"
          @timeupdate="onTimeUpdate"
          @play="isPaused = false"
          @pause="isPaused = true"
          @volumechange="onVideoVolumeChange"
        />
      </TransitionFade>
      <TransitionFade>
        <img
          v-if="!isVideo"
          v-show="isReady"
          ref="media"
          :src="props.src"
          alt=""
          draggable="false"
          class="pointer-events-none block max-h-none max-w-none"
          :style="mediaStyle"
          @load="onImgLoad"
        />
      </TransitionFade>
    </div>

    <TransitionFade>
      <div
        v-if="!isReady"
        class="pointer-events-none absolute inset-0 flex items-center
          justify-center"
      >
        <Icon name="loading" class="text-[5em] text-text-2" />
      </div>
    </TransitionFade>

    <AssetModalVideoControls
      v-if="isVideo && isReady"
      :is-paused="isPaused"
      :current-time="currentTime"
      :duration="duration"
      :is-muted="isMuted"
      :volume="volume"
      :has-audio="hasAudio"
      @toggle-play="togglePlay"
      @seek="seek"
      @toggle-mute="toggleMute"
      @volume="onVolumeSlider"
    />
  </div>
</template>
