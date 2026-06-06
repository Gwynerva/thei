<script lang="ts" setup>
import {
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import type { MediaViewState } from './media-controls';
import { useMediaControls } from './media-controls';

export interface VideoPlaybackState {
  currentTime: number;
  volume: number;
  muted: boolean;
}

const props = defineProps<{
  extension: string;
  src: string;
  hasAudio?: boolean;
  initialViewState?: MediaViewState;
  initialPlaybackState?: VideoPlaybackState;
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
  getViewState,
  restoreViewState,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  initMedia,
  onMediaLoaded,
} = useMediaControls();

const containerRef = useTemplateRef<HTMLElement>('container');
const mediaRef = useTemplateRef<HTMLVideoElement | HTMLImageElement>('media');
let initialViewStateRestored = false;

// ─── video playback state ──────────────────────────────────────────────────

const isPaused = ref(true);
const currentTime = ref(0);
const duration = ref(0);
const isMuted = ref(false);
const volume = ref(1);
const hasAudio = ref(props.hasAudio ?? true);
let initialPlaybackStateRestored = false;

watch(
  () => props.hasAudio,
  (value) => {
    if (value !== undefined) hasAudio.value = value;
  },
);

const seekPct = computed(() =>
  duration.value > 0 ? `${(currentTime.value / duration.value) * 100}%` : '0%',
);

const volumePct = computed(() =>
  isMuted.value ? '0%' : `${volume.value * 100}%`,
);

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function togglePlay(): void {
  const v = mediaRef.value as HTMLVideoElement;
  if (isPaused.value) {
    v.play();
  } else {
    v.pause();
  }
}

function seek(e: Event): void {
  const val = parseFloat((e.target as HTMLInputElement).value);
  if (!Number.isFinite(val)) return;
  initialPlaybackStateRestored = true;
  currentTime.value = val;
  (mediaRef.value as HTMLVideoElement).currentTime = val;
}

function toggleMute(): void {
  const v = mediaRef.value as HTMLVideoElement;
  v.muted = !v.muted;
}

function onVolumeSlider(e: Event): void {
  const val = parseFloat((e.target as HTMLInputElement).value);
  const v = mediaRef.value as HTMLVideoElement;
  v.volume = val;
  if (val > 0 && v.muted) v.muted = false;
  else if (val === 0 && !v.muted) v.muted = true;
}

function onVideoVolumeChange(e: Event): void {
  const v = e.target as HTMLVideoElement;
  isMuted.value = v.muted;
  volume.value = v.volume;
}

function getPlaybackState(): VideoPlaybackState | undefined {
  if (!isVideo) return undefined;
  const v = mediaRef.value as HTMLVideoElement | undefined;
  return {
    currentTime: v?.currentTime ?? currentTime.value,
    volume: v?.volume ?? volume.value,
    muted: v?.muted ?? isMuted.value,
  };
}

// ─── mount ────────────────────────────────────────────────────────────────

onMounted(() => {
  const container = containerRef.value;
  const media = mediaRef.value;
  if (!container) return;

  initMedia(container, () => {
    if (!media) return null;
    if (isVideo) {
      const v = media as HTMLVideoElement;
      return v.videoWidth > 0 ? { w: v.videoWidth, h: v.videoHeight } : null;
    } else {
      const img = media as HTMLImageElement;
      return img.naturalWidth > 0
        ? { w: img.naturalWidth, h: img.naturalHeight }
        : null;
    }
  });
  nextTick(restoreInitialViewState);
});

function restoreInitialViewState(): void {
  if (initialViewStateRestored || !props.initialViewState || !isReady.value) {
    return;
  }
  initialViewStateRestored = true;
  restoreViewState(props.initialViewState);
}

function onImgLoad(e: Event): void {
  const img = e.target as HTMLImageElement;
  // SVGs scale to any size; don't use naturalWidth/naturalHeight (which may
  // reflect viewBox extents) — pass 0,0 to trigger the container-based fallback.
  if (props.extension === 'svg') {
    onMediaLoaded(0, 0);
  } else {
    onMediaLoaded(img.naturalWidth, img.naturalHeight);
  }
  restoreInitialViewState();
}

function onVideoMeta(e: Event): void {
  const v = e.target as HTMLVideoElement;
  onMediaLoaded(v.videoWidth, v.videoHeight);
  restoreInitialViewState();
  duration.value = v.duration;
  const initial = props.initialPlaybackState;
  if (initial && !initialPlaybackStateRestored) {
    initialPlaybackStateRestored = true;
    v.currentTime = Math.min(
      initial.currentTime,
      v.duration || initial.currentTime,
    );
    v.volume = initial.volume;
    v.muted = initial.muted;
    currentTime.value = v.currentTime;
    volume.value = v.volume;
    isMuted.value = v.muted;
  }
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
  getViewState,
  getPlaybackState,
});
</script>

<template>
  <!-- outer: captures events, clips overflow, no scroll -->
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
    <!-- inner: fills container so translate origin == container center -->
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

    <!-- loading spinner — shown until media dimensions are known and isReady is set -->
    <TransitionFade>
      <div
        v-if="!isReady"
        class="pointer-events-none absolute inset-0 flex items-center
          justify-center"
      >
        <Icon name="loading" class="text-[5em] text-text-2" />
      </div>
    </TransitionFade>

    <!-- custom video controls — rendered outside the transform div so they stay fixed on-screen -->
    <div
      v-if="isVideo && isReady"
      class="absolute right-md bottom-md left-md z-10 flex min-w-80
        cursor-default items-center rounded-full border-2 border-border-3/30
        bg-bg-2/60 px-xs shadow-[0_0_10px_2px_var(--color-shadow-3)]
        backdrop-blur transition sm:right-0 sm:left-1/2 sm:w-5/8
        sm:-translate-x-1/2 hocus:border-border-3/50 hocus:bg-bg-2/80"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @pointercancel.stop
    >
      <!-- play / pause -->
      <button
        class="flex cursor-pointer items-center justify-center rounded-full p-xs
          text-text-1/70 transition hocus:text-text-1"
        @click="togglePlay"
      >
        <Icon :name="isPaused ? 'play-circle' : 'pause-circle'" />
      </button>

      <!-- current time -->
      <span class="shrink-0 text-xs text-text-1/70 tabular-nums select-none">
        {{ formatTime(currentTime) }}
      </span>

      <!-- seek bar -->
      <input
        type="range"
        class="seek-bar mx-sm"
        min="0"
        :max="duration || 0"
        :value="currentTime"
        step="0.01"
        :style="{ '--pct': seekPct }"
        @input="seek"
      />

      <!-- total duration -->
      <span class="shrink-0 text-xs text-text-1/70 tabular-nums select-none">
        {{ formatTime(duration) }}
      </span>

      <!-- mute / unmute -->
      <button
        v-if="hasAudio"
        class="flex shrink-0 cursor-pointer items-center justify-center
          rounded-full p-xs text-text-1/70 transition hocus:text-text-1"
        @click="toggleMute"
      >
        <Icon :name="isMuted || volume === 0 ? 'volume-off' : 'volume-on'" />
      </button>

      <!-- volume slider -->
      <input
        v-if="hasAudio"
        type="range"
        class="volume-bar mr-xs"
        min="0"
        max="1"
        :value="isMuted ? 0 : volume"
        step="0.01"
        :style="{ '--pct': volumePct }"
        @input="onVolumeSlider"
      />
    </div>
  </div>
</template>

<style scoped>
.seek-bar,
.volume-bar {
  appearance: none;
  -webkit-appearance: none;
  height: 4px;
  border-radius: 2px;
  cursor: pointer;
  outline: none;
  background: linear-gradient(
    to right,
    color-mix(in oklch, var(--color-text-1) 70%, transparent) 0%,
    color-mix(in oklch, var(--color-text-1) 70%, transparent) var(--pct, 0%),
    color-mix(in oklch, var(--color-text-1) 20%, transparent) var(--pct, 0%),
    color-mix(in oklch, var(--color-text-1) 20%, transparent) 100%
  );
}

.seek-bar {
  flex: 1;
  min-width: 0;
}

.volume-bar {
  width: 2.5rem;
  flex-shrink: 0;
}

.seek-bar::-webkit-slider-thumb,
.volume-bar::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-text-1);
  cursor: pointer;
  transition: transform 0.15s;
}

.seek-bar::-webkit-slider-thumb:hover,
.volume-bar::-webkit-slider-thumb:hover {
  transform: scale(1.3);
}

.seek-bar::-moz-range-thumb,
.volume-bar::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  background: var(--color-text-1);
  cursor: pointer;
}

.seek-bar::-moz-range-track,
.volume-bar::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: transparent;
}
</style>
