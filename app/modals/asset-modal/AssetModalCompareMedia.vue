<script lang="ts" setup>
import {
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import {
  buildCompareMediaLayout,
  compareFitZoomTarget,
  compareSideZoomTarget,
  compareZoomPercent,
  getCompareSideMetrics,
  type CompareMediaDimensions,
  type CompareMediaMode,
  type CompareMediaSide,
} from './compare-media';
import AssetModalVideoControls from './AssetModalVideoControls.vue';
import { useMediaControls } from './media-controls';

export interface CompareMediaSource {
  key: string;
  extension: string;
  src: string;
  hasAudio?: boolean;
  displayDimensions?: CompareMediaDimensions;
}

const props = defineProps<{
  original: CompareMediaSource;
  modified: CompareMediaSource;
  originalLabel: string;
  modifiedLabel: string;
  disableSeamless?: boolean;
}>();

const containerRef = useTemplateRef<HTMLElement>('container');
const dividerRef = useTemplateRef<HTMLElement>('divider');
const originalMediaRef = useTemplateRef<HTMLVideoElement | HTMLImageElement>(
  'originalMedia',
);
const modifiedMediaRef = useTemplateRef<HTMLVideoElement | HTMLImageElement>(
  'modifiedMedia',
);

const originalDimensions = ref<CompareMediaDimensions | null>(null);
const modifiedDimensions = ref<CompareMediaDimensions | null>(null);
const containerDimensions = ref<CompareMediaDimensions | null>(null);
const dividerPercent = ref(50);
const isDividerDragging = ref(false);
const compareMode = ref<CompareMediaMode>('seamless');
const activeFitSide = ref<CompareMediaSide>('original');
let dividerResizeObserver: ResizeObserver | null = null;
let dividerResizeTimer: number | null = null;
let dividerRatio = 0.5;
const FIT_PADDING = 48;

const originalIsVideo = computed(() =>
  isExtensionAllowed(props.original.extension, videoExtensionProfile),
);
const modifiedIsVideo = computed(() =>
  isExtensionAllowed(props.modified.extension, videoExtensionProfile),
);
const hasVideo = computed(() => originalIsVideo.value || modifiedIsVideo.value);
const hasAudio = computed(
  () =>
    (originalIsVideo.value && props.original.hasAudio !== false) ||
    (modifiedIsVideo.value && props.modified.hasAudio !== false),
);

const compareLayout = computed(() => {
  if (!originalDimensions.value || !modifiedDimensions.value) return null;
  return buildCompareMediaLayout(
    originalDimensions.value,
    modifiedDimensions.value,
    effectiveCompareMode.value,
  );
});
const effectiveCompareMode = computed<CompareMediaMode>(() =>
  props.disableSeamless ? 'real' : compareMode.value,
);
const isSeamlessMode = computed(
  () => effectiveCompareMode.value === 'seamless',
);

const maxCompareZoom = computed(() => {
  const layout = compareLayout.value;
  if (!layout) return 5;
  return Math.max(
    5,
    compareSideZoomTarget(layout.originalScale),
    compareSideZoomTarget(layout.modifiedScale),
  );
});

const {
  zoom,
  transformStyle,
  isDraggable,
  isDragging,
  isFitMode,
  isReady,
  fitToCurrentTarget,
  zoomTo,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  initMedia,
  onMediaLoaded,
} = useMediaControls({
  maxZoom: () => maxCompareZoom.value,
  fitZoom: (container) => activeFitZoomTarget(container, activeFitSide.value),
  uncappedFitZoom: (container) =>
    activeFitZoomTarget(container, activeFitSide.value, false),
});

const originalPercent = computed(() =>
  compareZoomPercent(zoom.value, compareLayout.value?.originalScale ?? 1),
);
const modifiedPercent = computed(() =>
  compareZoomPercent(zoom.value, compareLayout.value?.modifiedScale ?? 1),
);

const dividerStyle = computed(() => ({ left: `${dividerPercent.value}%` }));
const originalClipStyle = computed(() => ({
  clipPath: `inset(0 ${100 - dividerPercent.value}% 0 0)`,
}));
const modifiedClipStyle = computed(() => ({
  clipPath: `inset(0 0 0 ${dividerPercent.value}%)`,
}));

const originalMediaStyle = computed(() =>
  buildMediaStyle('original', originalDimensions.value),
);
const modifiedMediaStyle = computed(() =>
  buildMediaStyle('modified', modifiedDimensions.value),
);

const isPaused = ref(true);
const currentTime = ref(0);
const duration = ref(0);
const isMuted = ref(false);
const volume = ref(1);

watch(
  () => props.original.key,
  () => {
    originalDimensions.value = props.original.displayDimensions ?? null;
    activeFitSide.value = 'original';
    resetVideoState();
  },
  { immediate: true },
);

watch(
  () => props.modified.key,
  () => {
    modifiedDimensions.value = props.modified.displayDimensions ?? null;
    activeFitSide.value = 'original';
    resetVideoState();
  },
  { immediate: true },
);

watch(
  compareLayout,
  () => {
    syncControlDimensions();
  },
  { flush: 'post' },
);

watch(
  () => props.disableSeamless,
  (disabled) => {
    compareMode.value = disabled ? 'real' : 'seamless';
  },
  { immediate: true },
);

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;

  initMedia(container, () => {
    const base = compareLayout.value?.base;
    return base ? { w: base.width, h: base.height } : null;
  });
  syncControlDimensions();

  dividerResizeObserver = new ResizeObserver(scheduleDividerResize);
  dividerResizeObserver.observe(container);
  updateContainerDimensions(container);
});

onUnmounted(() => {
  dividerResizeObserver?.disconnect();
  dividerResizeObserver = null;
  if (dividerResizeTimer !== null) {
    window.clearTimeout(dividerResizeTimer);
    dividerResizeTimer = null;
  }
});

function syncControlDimensions(): void {
  const base = compareLayout.value?.base;
  if (!base || !containerRef.value) return;
  onMediaLoaded(base.width, base.height);
}

function updateContainerDimensions(container: HTMLElement): void {
  const rect = container.getBoundingClientRect();
  containerDimensions.value = {
    width: rect.width,
    height: rect.height,
  };
}

function buildMediaStyle(
  side: CompareMediaSide,
  dimensions: CompareMediaDimensions | null,
) {
  const layout = compareLayout.value;
  if (!layout || !dimensions) return {};

  const metrics = getCompareSideMetrics(layout, side, dimensions);

  return {
    width: `${metrics.width}px`,
    height: `${metrics.height}px`,
    transform: `scale(${zoom.value})`,
    transformOrigin: 'center',
    willChange: 'transform',
  };
}

function toggleSideZoom(side: CompareMediaSide): void {
  const fitTarget = sideFitZoomTarget(side, containerDimensions.value);
  const hundredTarget = sideHundredZoomTarget(side);
  if (!fitTarget || !hundredTarget) return;

  if (isFitMode.value && activeFitSide.value === side) {
    zoomTo(hundredTarget);
    return;
  }

  activeFitSide.value = side;
  fitToCurrentTarget();
}

function toggleCompareMode(): void {
  if (props.disableSeamless) return;
  compareMode.value = isSeamlessMode.value ? 'real' : 'seamless';
}

function activeFitZoomTarget(
  container: CompareMediaDimensions | null,
  side: CompareMediaSide,
  capAtSideHundred = true,
): number | undefined {
  return sideFitZoomTarget(side, container, capAtSideHundred);
}

function sideFitZoomTarget(
  side: CompareMediaSide,
  container: CompareMediaDimensions | null,
  capAtSideHundred = true,
): number | undefined {
  const layout = compareLayout.value;
  const dimensions =
    side === 'original' ? originalDimensions.value : modifiedDimensions.value;
  if (!layout || !container || !dimensions) return;

  return compareFitZoomTarget(
    getCompareSideMetrics(layout, side, dimensions),
    container,
    FIT_PADDING,
    capAtSideHundred,
  );
}

function sideHundredZoomTarget(side: CompareMediaSide): number | undefined {
  const layout = compareLayout.value;
  if (!layout) return;
  return compareSideZoomTarget(
    side === 'original' ? layout.originalScale : layout.modifiedScale,
  );
}

function onImageLoad(side: CompareMediaSide, e: Event): void {
  const source = side === 'original' ? props.original : props.modified;
  if (source.displayDimensions) {
    setDimensions(side, source.displayDimensions);
    return;
  }

  const img = e.target as HTMLImageElement;
  setDimensions(side, {
    width: Math.max(img.naturalWidth, 1),
    height: Math.max(img.naturalHeight, 1),
  });
}

function onVideoMeta(side: CompareMediaSide, e: Event): void {
  const source = side === 'original' ? props.original : props.modified;
  const video = e.target as HTMLVideoElement;
  setDimensions(side, {
    width: source.displayDimensions?.width ?? video.videoWidth,
    height: source.displayDimensions?.height ?? video.videoHeight,
  });

  applyVideoVolume(video);
  updateDuration();
}

function setDimensions(
  side: CompareMediaSide,
  dimensions: CompareMediaDimensions,
): void {
  if (dimensions.width <= 0 || dimensions.height <= 0) return;

  if (side === 'original') {
    originalDimensions.value = dimensions;
  } else {
    modifiedDimensions.value = dimensions;
  }
}

function onDividerPointerDown(e: PointerEvent): void {
  e.preventDefault();
  isDividerDragging.value = true;
  updateDividerPosition(e.clientX);
  dividerRef.value?.setPointerCapture(e.pointerId);
}

function onDividerPointerMove(e: PointerEvent): void {
  if (!isDividerDragging.value) return;
  e.preventDefault();
  updateDividerPosition(e.clientX);
}

function onDividerPointerUp(e: PointerEvent): void {
  if (!isDividerDragging.value) return;
  e.preventDefault();
  isDividerDragging.value = false;
  if (dividerRef.value?.hasPointerCapture(e.pointerId)) {
    dividerRef.value.releasePointerCapture(e.pointerId);
  }
}

function updateDividerPosition(clientX: number): void {
  const container = containerRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const ratio = (clientX - rect.left) / rect.width;
  dividerRatio = Math.min(1, Math.max(0, ratio));
  dividerPercent.value = dividerRatio * 100;
}

function scheduleDividerResize(): void {
  if (dividerResizeTimer !== null) {
    window.clearTimeout(dividerResizeTimer);
  }

  dividerResizeTimer = window.setTimeout(() => {
    dividerResizeTimer = null;
    const container = containerRef.value;
    if (container) updateContainerDimensions(container);
    dividerPercent.value = dividerRatio * 100;
  }, 120);
}

function videoElements(): HTMLVideoElement[] {
  return [originalMediaRef.value, modifiedMediaRef.value].filter(
    (el): el is HTMLVideoElement => el instanceof HTMLVideoElement,
  );
}

function primaryVideo(): HTMLVideoElement | undefined {
  if (modifiedMediaRef.value instanceof HTMLVideoElement) {
    return modifiedMediaRef.value;
  }
  if (originalMediaRef.value instanceof HTMLVideoElement) {
    return originalMediaRef.value;
  }
}

function resetVideoState(): void {
  isPaused.value = true;
  currentTime.value = 0;
  duration.value = 0;
}

function togglePlay(): void {
  const videos = videoElements();
  if (isPaused.value) {
    for (const video of videos) {
      video.currentTime = Math.min(currentTime.value, video.duration || 0);
      applyVideoVolume(video);
      void video.play();
    }
    return;
  }

  for (const video of videos) {
    video.pause();
  }
}

function seek(value: number): void {
  currentTime.value = value;
  for (const video of videoElements()) {
    video.currentTime = Math.min(value, video.duration || value);
  }
}

function toggleMute(): void {
  isMuted.value = !isMuted.value;
  for (const video of videoElements()) {
    video.muted = isMuted.value;
  }
}

function onVolumeSlider(value: number): void {
  volume.value = value;
  if (value > 0 && isMuted.value) isMuted.value = false;
  else if (value === 0 && !isMuted.value) isMuted.value = true;

  for (const video of videoElements()) {
    applyVideoVolume(video);
  }
}

function applyVideoVolume(video: HTMLVideoElement): void {
  video.volume = volume.value;
  video.muted = isMuted.value;
}

function onVideoVolumeChange(e: Event): void {
  const video = e.target as HTMLVideoElement;
  if (video !== primaryVideo()) return;
  isMuted.value = video.muted;
  volume.value = video.volume;
}

function onVideoPlay(e: Event): void {
  if (e.target === primaryVideo()) isPaused.value = false;
}

function onVideoPause(e: Event): void {
  if (e.target === primaryVideo()) isPaused.value = true;
}

function onDurationChange(): void {
  updateDuration();
}

function updateDuration(): void {
  const primary = primaryVideo();
  duration.value = primary?.duration || 0;
}

function onTimeUpdate(e: Event): void {
  if (e.target === primaryVideo()) {
    currentTime.value = (e.target as HTMLVideoElement).currentTime;
  }
}
</script>

<template>
  <div
    ref="container"
    class="relative size-full overflow-hidden select-none"
    :style="{
      touchAction: 'none',
      cursor: isDividerDragging
        ? 'col-resize'
        : isDragging
          ? 'grabbing'
          : isDraggable
            ? 'grab'
            : 'default',
    }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <div class="absolute inset-0" :style="originalClipStyle">
      <div
        class="absolute inset-0 flex items-center justify-center"
        :style="{ transform: transformStyle, willChange: 'transform' }"
      >
        <TransitionFade>
          <video
            v-if="originalIsVideo"
            v-show="isReady"
            ref="originalMedia"
            :src="original.src"
            class="pointer-events-none block max-h-none max-w-none"
            :style="originalMediaStyle"
            @loadedmetadata="onVideoMeta('original', $event)"
            @durationchange="onDurationChange"
            @timeupdate="onTimeUpdate"
            @play="onVideoPlay"
            @pause="onVideoPause"
            @volumechange="onVideoVolumeChange"
          />
        </TransitionFade>
        <TransitionFade>
          <img
            v-if="!originalIsVideo"
            v-show="isReady"
            ref="originalMedia"
            :src="original.src"
            alt=""
            draggable="false"
            class="pointer-events-none block max-h-none max-w-none"
            :style="originalMediaStyle"
            @load="onImageLoad('original', $event)"
          />
        </TransitionFade>
      </div>
    </div>

    <div class="absolute inset-0" :style="modifiedClipStyle">
      <div
        class="absolute inset-0 flex items-center justify-center"
        :style="{ transform: transformStyle, willChange: 'transform' }"
      >
        <TransitionFade>
          <video
            v-if="modifiedIsVideo"
            v-show="isReady"
            ref="modifiedMedia"
            :src="modified.src"
            class="pointer-events-none block max-h-none max-w-none"
            :style="modifiedMediaStyle"
            @loadedmetadata="onVideoMeta('modified', $event)"
            @durationchange="onDurationChange"
            @timeupdate="onTimeUpdate"
            @play="onVideoPlay"
            @pause="onVideoPause"
            @volumechange="onVideoVolumeChange"
          />
        </TransitionFade>
        <TransitionFade>
          <img
            v-if="!modifiedIsVideo"
            v-show="isReady"
            ref="modifiedMedia"
            :src="modified.src"
            alt=""
            draggable="false"
            class="pointer-events-none block max-h-none max-w-none"
            :style="modifiedMediaStyle"
            @load="onImageLoad('modified', $event)"
          />
        </TransitionFade>
      </div>
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

    <div
      class="pointer-events-none absolute inset-y-0 z-20"
      :style="dividerStyle"
    >
      <button
        class="pointer-events-auto absolute top-1/2 right-sm flex w-22
          -translate-y-1/2 cursor-pointer flex-col items-center rounded-md
          border border-border-3/30 bg-bg-2/60 px-1.5 py-0.5 text-center
          text-text-1/75 shadow-[0_0_10px_2px_var(--color-shadow-3)]
          backdrop-blur transition hocus:border-border-3/50 hocus:bg-bg-2/80
          hocus:text-text-1"
        @pointerdown.stop
        @click="toggleSideZoom('original')"
      >
        <span
          class="text-[0.625rem] leading-tight font-semibold whitespace-nowrap"
        >
          {{ originalLabel }}
        </span>
        <span class="text-[0.6875rem] leading-tight font-bold tabular-nums">
          {{ originalPercent }}%
        </span>
      </button>

      <button
        class="pointer-events-auto absolute top-1/2 left-sm flex w-22
          -translate-y-1/2 cursor-pointer flex-col items-center rounded-md
          border border-accent/60 bg-bg-accent/80 px-1.5 py-0.5 text-center
          text-accent shadow-[0_0_10px_2px_var(--color-shadow-3)] backdrop-blur
          transition hocus:border-accent hocus:bg-bg-accent hocus:text-accent"
        @pointerdown.stop
        @click="toggleSideZoom('modified')"
      >
        <span
          class="text-[0.625rem] leading-tight font-semibold whitespace-nowrap"
        >
          {{ modifiedLabel }}
        </span>
        <span class="text-[0.6875rem] leading-tight font-bold tabular-nums">
          {{ modifiedPercent }}%
        </span>
      </button>
    </div>

    <div
      ref="divider"
      class="absolute top-0 bottom-0 z-30 w-8 -translate-x-1/2
        cursor-col-resize"
      :style="dividerStyle"
      aria-label="Compare preview divider"
      role="separator"
      @pointerdown.stop="onDividerPointerDown"
      @pointermove.stop="onDividerPointerMove"
      @pointerup.stop="onDividerPointerUp"
      @pointercancel.stop="onDividerPointerUp"
    >
      <button
        type="button"
        class="pointer-events-auto absolute top-[calc(50%-3.75rem)] left-1/2
          z-10 flex size-7 -translate-x-1/2 items-center justify-center
          rounded-full border-2 shadow-[0_0_10px_2px_var(--color-shadow-3)]
          backdrop-blur transition"
        :class="
          isSeamlessMode
            ? 'border-accent/70 bg-bg-accent/80 text-accent hocus:border-accent'
            : `border-border-3/40 bg-bg-2/70 text-text-2
              hocus:border-border-3/60 hocus:bg-bg-2/80 hocus:text-text-1`
        "
        :aria-pressed="isSeamlessMode"
        aria-label="Toggle seamless compare mode"
        @pointerdown.stop
        @pointerup.stop
        @click.stop="toggleCompareMode"
      >
        <Icon name="link" class="text-sm" />
      </button>
      <span
        class="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2
          bg-text-1/60 shadow-[0_0_10px_2px_var(--color-shadow-3)]"
      />
      <span
        class="absolute top-1/2 left-1/2 flex h-14 w-5 -translate-x-1/2
          -translate-y-1/2 items-center justify-center rounded-full border-2
          border-border-3/40 bg-bg-2/70
          shadow-[0_0_10px_2px_var(--color-shadow-3)] backdrop-blur"
      >
        <span class="h-8 w-px rounded-full bg-text-1/60" />
      </span>
    </div>

    <AssetModalVideoControls
      v-if="hasVideo && isReady"
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
