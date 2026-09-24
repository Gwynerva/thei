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
import type {
  AssetCropRect,
  AssetRotation,
} from '#layers/thei/shared/asset-crop';
import AssetModalVideoControls from './AssetModalVideoControls.vue';
import { useMediaControls } from './media-controls';
import { useVideoPlayback } from './use-video-playback';

export interface CompareMediaSource {
  key: string;
  extension: string;
  src: string;
  hasAudio?: boolean;
  displayDimensions?: CompareMediaDimensions;
  /**
   * Show only this region of the media, in its pixels. `displayDimensions`
   * is then the region's size, so both sides line up at the same scale.
   * With a `rotation` the media is turned first, and `source` and `rect`
   * are in the turned frame.
   */
  crop?: {
    rect: AssetCropRect;
    source: CompareMediaDimensions;
    rotation?: AssetRotation;
  };
}

const props = defineProps<{
  original: CompareMediaSource;
  modified: CompareMediaSource;
  originalLabel: string;
  modifiedLabel: string;
  disableSeamless?: boolean;
  /** The modified side is about to be replaced by a newer one. */
  modifiedPending?: boolean;
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
// Only the master side is audible, so the controls follow its audio track.
const hasAudio = computed(() =>
  modifiedIsVideo.value
    ? props.modified.hasAudio
    : originalIsVideo.value
      ? props.original.hasAudio
      : false,
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
const originalCrop = computed(() =>
  buildCropStyle(props.original, originalDimensions.value, 'original'),
);
const modifiedMediaStyle = computed(() =>
  buildMediaStyle('modified', modifiedDimensions.value),
);

const { state: playback, controller: playbackController } = useVideoPlayback();

// The result is the master clock; the source follows it muted.
watch(
  [originalMediaRef, modifiedMediaRef],
  ([original, modified]) => {
    const originalVideo =
      original instanceof HTMLVideoElement ? original : null;
    const modifiedVideo =
      modified instanceof HTMLVideoElement ? modified : null;
    playbackController.attach(modifiedVideo ?? originalVideo, [
      modifiedVideo ? originalVideo : null,
    ]);
  },
  { flush: 'post', immediate: true },
);

useSpacePlaybackToggle(
  () => containerRef.value,
  () => playbackController.togglePlay(),
  () => hasVideo.value && isReady.value,
);

watch(
  () => props.original.key,
  () => {
    originalDimensions.value = props.original.displayDimensions ?? null;
    activeFitSide.value = 'original';
  },
  { immediate: true },
);

watch(
  () => props.modified.key,
  () => {
    modifiedDimensions.value = props.modified.displayDimensions ?? null;
    activeFitSide.value = 'original';
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

  // The zoom sizes the box itself rather than scaling it: a scaled layer is
  // drawn once at its unzoomed size and then stretched, which blurs a vector
  // and any side laid out smaller than its own pixels.
  return {
    width: `${metrics.width * zoom.value}px`,
    height: `${metrics.height * zoom.value}px`,
  };
}

/**
 * Places the whole media inside a cropped side's frame so that only the
 * region shows, at the frame's scale. A turned media is drawn unturned and
 * turned in place, centred in the turned frame.
 */
function buildCropStyle(
  source: CompareMediaSource,
  dimensions: CompareMediaDimensions | null,
  side: CompareMediaSide,
) {
  const layout = compareLayout.value;
  if (!source.crop || !layout || !dimensions) return undefined;
  const { rect, source: frame, rotation = 0 } = source.crop;
  const metrics = getCompareSideMetrics(layout, side, dimensions);
  const scale = (metrics.width * zoom.value) / rect.width;
  const sideways = rotation === 90 || rotation === 270;
  return {
    frame: {
      width: `${frame.width * scale}px`,
      height: `${frame.height * scale}px`,
      left: `${-rect.left * scale}px`,
      top: `${-rect.top * scale}px`,
    },
    media: rotation
      ? {
          width: `${(sideways ? frame.height : frame.width) * scale}px`,
          height: `${(sideways ? frame.width : frame.height) * scale}px`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        }
      : undefined,
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
          <div
            v-if="originalCrop"
            v-show="isReady"
            class="relative shrink-0 overflow-hidden"
            :style="originalMediaStyle"
          >
            <div class="absolute" :style="originalCrop.frame">
              <video
                v-if="originalIsVideo"
                ref="originalMedia"
                :src="sitePath(original.src)"
                class="pointer-events-none block max-h-none max-w-none"
                :class="
                  originalCrop.media ? 'absolute top-1/2 left-1/2' : 'size-full'
                "
                :style="originalCrop.media"
                @loadedmetadata="onVideoMeta('original', $event)"
              />
              <img
                v-else
                ref="originalMedia"
                :src="sitePath(original.src)"
                alt=""
                draggable="false"
                class="pointer-events-none block max-h-none max-w-none"
                :class="
                  originalCrop.media ? 'absolute top-1/2 left-1/2' : 'size-full'
                "
                :style="originalCrop.media"
                @load="onImageLoad('original', $event)"
              />
            </div>
          </div>
          <video
            v-else-if="originalIsVideo"
            v-show="isReady"
            ref="originalMedia"
            :src="sitePath(original.src)"
            class="pointer-events-none block max-h-none max-w-none shrink-0"
            :style="originalMediaStyle"
            @loadedmetadata="onVideoMeta('original', $event)"
          />
          <img
            v-else
            v-show="isReady"
            ref="originalMedia"
            :src="sitePath(original.src)"
            alt=""
            draggable="false"
            class="pointer-events-none block max-h-none max-w-none shrink-0"
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
            :src="sitePath(modified.src)"
            class="pointer-events-none block max-h-none max-w-none shrink-0"
            :style="modifiedMediaStyle"
            @loadedmetadata="onVideoMeta('modified', $event)"
          />
        </TransitionFade>
        <TransitionFade>
          <img
            v-if="!modifiedIsVideo"
            v-show="isReady"
            ref="modifiedMedia"
            :src="sitePath(modified.src)"
            alt=""
            draggable="false"
            class="pointer-events-none block max-h-none max-w-none shrink-0"
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
        <Icon name="loading" class="text-7xl text-text-2" />
      </div>
    </TransitionFade>

    <div
      class="pointer-events-none absolute inset-y-0 z-20"
      :style="dividerStyle"
    >
      <button
        type="button"
        class="pointer-events-auto absolute top-1/2 right-sm flex w-22
          -translate-y-1/2 cursor-pointer flex-col items-center rounded-md
          border border-border-3/30 bg-bg-2/60 px-1.5 py-0.5 text-center
          text-text-1/75 shadow-lg shadow-shadow-3 backdrop-blur transition
          hocus:border-border-3/50 hocus:bg-bg-2/80 hocus:text-text-1"
        @pointerdown.stop
        @click="toggleSideZoom('original')"
      >
        <span class="text-xs leading-tight font-semibold whitespace-nowrap">
          {{ originalLabel }}
        </span>
        <span class="text-xs leading-tight font-bold tabular-nums">
          {{ originalPercent }}%
        </span>
      </button>

      <button
        type="button"
        class="pointer-events-auto absolute top-1/2 left-sm flex w-22
          -translate-y-1/2 cursor-pointer flex-col items-center rounded-md
          border border-accent/60 bg-bg-accent/80 px-1.5 py-0.5 text-center
          text-accent shadow-lg shadow-shadow-3 backdrop-blur transition
          hocus:border-accent hocus:bg-bg-accent hocus:text-accent"
        @pointerdown.stop
        @click="toggleSideZoom('modified')"
      >
        <span class="text-xs leading-tight font-semibold whitespace-nowrap">
          {{ modifiedLabel }}
        </span>
        <span
          class="flex items-center gap-0.5 text-xs leading-tight font-bold
            tabular-nums"
        >
          <Icon v-if="modifiedPending" name="loading" class="text-xs" />
          {{ modifiedPercent }}%
        </span>
      </button>
    </div>

    <div
      ref="divider"
      class="absolute top-0 bottom-0 z-30 w-8 -translate-x-1/2
        cursor-col-resize"
      :style="dividerStyle"
      :aria-label="phrase.upload_compare_divider"
      role="separator"
      @pointerdown.stop="onDividerPointerDown"
      @pointermove.stop="onDividerPointerMove"
      @pointerup.stop="onDividerPointerUp"
      @pointercancel.stop="onDividerPointerUp"
    >
      <button
        type="button"
        class="pointer-events-auto absolute top-[calc(50%-var(--spacing)*15)]
          left-1/2 z-10 flex size-7 -translate-x-1/2 items-center justify-center
          rounded-full border-2 shadow-lg shadow-shadow-3 backdrop-blur
          transition"
        :class="
          isSeamlessMode
            ? 'border-accent/70 bg-bg-accent/80 text-accent hocus:border-accent'
            : `border-border-3/40 bg-bg-2/70 text-text-2
              hocus:border-border-3/60 hocus:bg-bg-2/80 hocus:text-text-1`
        "
        :aria-pressed="isSeamlessMode"
        :aria-label="phrase.upload_compare_toggle_mode"
        @pointerdown.stop
        @pointerup.stop
        @click.stop="toggleCompareMode"
      >
        <Icon name="link" class="text-sm" />
      </button>
      <span
        class="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2
          bg-text-1/60 shadow-lg shadow-shadow-3"
      />
      <span
        class="absolute top-1/2 left-1/2 flex h-14 w-5 -translate-x-1/2
          -translate-y-1/2 items-center justify-center rounded-full border-2
          border-border-3/40 bg-bg-2/70 shadow-lg shadow-shadow-3 backdrop-blur"
      >
        <span class="h-8 w-px rounded-full bg-text-1/60" />
      </span>
    </div>

    <AssetModalVideoControls
      v-if="hasVideo && isReady"
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
