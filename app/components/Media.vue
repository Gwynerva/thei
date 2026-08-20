<script lang="ts" setup>
import type { MediaKind } from '#layers/thei/shared/media';
import {
  preserveContentMediaPlayback,
  restoredContentMediaTime,
} from '#layers/thei/shared/content-media-playback';

defineOptions({ inheritAttrs: false });

type Phase = 'idle' | 'loading' | 'armed' | 'visible' | 'error';

const LOADED_MEDIA_SOURCE_LIMIT = 256;
const loadedMediaSources = new Set<string>();

function rememberLoadedMediaSource(source: string) {
  loadedMediaSources.delete(source);
  loadedMediaSources.add(source);
  if (loadedMediaSources.size <= LOADED_MEDIA_SOURCE_LIMIT) return;
  const oldest = loadedMediaSources.values().next().value;
  if (oldest) loadedMediaSources.delete(oldest);
}

const props = withDefaults(
  defineProps<{
    src: string;
    kind?: MediaKind;
    previewSrc?: string;
    accentHue?: number;
    width?: number;
    height?: number;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    controls?: boolean;
    fit?: 'cover' | 'contain';
    naturalSize?: boolean;
    backdrop?: boolean;
    alt?: string;
  }>(),
  {
    kind: 'image',
    autoplay: false,
    muted: false,
    loop: false,
    controls: false,
    fit: 'cover',
    naturalSize: false,
    backdrop: false,
    alt: '',
  },
);

const attrs = useAttrs();
const emit = defineEmits<{
  dimensions: [width: number, height: number];
}>();
const rootEl = useTemplateRef<HTMLElement>('rootEl');
const previewEl = useTemplateRef<HTMLImageElement>('previewEl');
const imageEl = useTemplateRef<HTMLImageElement>('imageEl');
const videoEl = useTemplateRef<HTMLVideoElement>('videoEl');
const active = ref(false);
const previewPhase = ref<Phase>('idle');
const mediaPhase = ref<Phase>('idle');
const finalRequested = ref(false);
const fastPreview = ref(false);
const fastMedia = ref(false);
const wantsPlayback = ref(props.autoplay);
let observer: IntersectionObserver | undefined;
let generation = 0;
let frames: number[] = [];
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let savedTime = 0;
let internalPause = false;
let userOverrodePlayback = false;

const resolvedPreviewSrc = computed(() => props.previewSrc || props.src);
const accentColor = computed(() =>
  props.accentHue === undefined
    ? 'var(--color-bg-3)'
    : `oklch(var(--lightness-accent) var(--chroma-accent) ${props.accentHue})`,
);
const loading = computed(
  () =>
    active.value &&
    previewPhase.value !== 'visible' &&
    previewPhase.value !== 'error',
);
const mediaClass = computed(() => [
  props.fit === 'contain' ? 'object-contain' : 'object-cover',
  props.naturalSize && props.width && props.height
    ? 'media-natural-size'
    : 'inset-0 size-full',
]);
const naturalStyle = computed(() =>
  props.naturalSize && props.width && props.height
    ? {
        width: 'auto',
        height: 'auto',
        aspectRatio: `${props.width} / ${props.height}`,
      }
    : undefined,
);
const rootStyle = computed(() => ({
  '--media-accent': accentColor.value,
}));

function cancelPending() {
  frames.forEach(cancelAnimationFrame);
  frames = [];
  clearTimeout(previewTimer);
  previewTimer = undefined;
}

function reset() {
  generation++;
  cancelPending();
  pauseForLifecycle();
  active.value = false;
  finalRequested.value = false;
  fastPreview.value = false;
  fastMedia.value = false;
  previewPhase.value = 'idle';
  mediaPhase.value = 'idle';
}

function enterViewport() {
  if (active.value) return;
  generation++;
  cancelPending();
  active.value = true;
  previewPhase.value = 'loading';
  mediaPhase.value = 'idle';
  finalRequested.value = false;
  fastPreview.value = loadedMediaSources.has(resolvedPreviewSrc.value);
  fastMedia.value = false;
  internalPause = false;
  if (!userOverrodePlayback) wantsPlayback.value = props.autoplay;
}

function leaveViewport() {
  if (videoEl.value) {
    const state = preserveContentMediaPlayback(
      { currentTime: savedTime, wantsPlayback: wantsPlayback.value },
      videoEl.value,
      internalPause,
    );
    savedTime = state.currentTime;
    wantsPlayback.value = state.wantsPlayback;
  }
  reset();
}

function arm(layer: 'preview' | 'media') {
  const phase = layer === 'preview' ? previewPhase : mediaPhase;
  if (!active.value || phase.value === 'visible' || phase.value === 'armed') {
    return;
  }
  const currentGeneration = generation;
  phase.value = 'armed';
  const first = requestAnimationFrame(() => {
    const second = requestAnimationFrame(() => {
      frames = frames.filter((id) => id !== first && id !== second);
      if (!active.value || generation !== currentGeneration) return;
      phase.value = 'visible';
      if (layer === 'preview') {
        previewTimer = setTimeout(
          () => {
            if (!active.value || generation !== currentGeneration) return;
            requestFinal();
          },
          fastPreview.value ? 120 : 240,
        );
      } else if (props.kind === 'video' && wantsPlayback.value) {
        void videoEl.value?.play().catch(() => {});
      }
    });
    frames.push(second);
  });
  frames.push(first);
}

async function armImage(
  layer: 'preview' | 'media',
  image: HTMLImageElement | null,
) {
  if (!image) return;
  await image.decode?.().catch(() => {});
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width > 0 && height > 0) emit('dimensions', width, height);
  const source = layer === 'preview' ? resolvedPreviewSrc.value : props.src;
  const wasLoaded = loadedMediaSources.has(source);
  if (layer === 'preview') fastPreview.value ||= wasLoaded;
  else fastMedia.value ||= wasLoaded;
  arm(layer);
  rememberLoadedMediaSource(source);
}

function requestFinal() {
  if (!active.value || finalRequested.value) return;
  finalRequested.value = true;
  fastMedia.value = loadedMediaSources.has(props.src);
  mediaPhase.value = 'loading';
}

function onError(layer: 'preview' | 'media') {
  if (layer === 'preview') previewPhase.value = 'error';
  else mediaPhase.value = 'error';
}

async function play() {
  if (props.kind !== 'video') return;
  wantsPlayback.value = true;
  userOverrodePlayback = true;
  if (active.value && previewPhase.value === 'visible') requestFinal();
  if (mediaPhase.value === 'visible') {
    await videoEl.value?.play().catch(() => {});
  }
}

function pause() {
  wantsPlayback.value = false;
  userOverrodePlayback = true;
  const video = videoEl.value;
  if (!video) return;
  video.pause();
}

function pauseForLifecycle() {
  const video = videoEl.value;
  if (!video) return;
  internalPause = true;
  video.pause();
}

function onVideoPlay() {
  if (!internalPause) {
    wantsPlayback.value = true;
    userOverrodePlayback = true;
  }
}

function onVideoPause() {
  if (!internalPause && active.value) {
    wantsPlayback.value = false;
    userOverrodePlayback = true;
  }
}

function onVideoLoaded() {
  const video = videoEl.value;
  if (video && savedTime > 0 && Number.isFinite(video.duration)) {
    video.currentTime = restoredContentMediaTime(savedTime, video.duration);
  }
  if (video?.videoWidth && video.videoHeight) {
    emit('dimensions', video.videoWidth, video.videoHeight);
  }
  arm('media');
  rememberLoadedMediaSource(props.src);
}

watch(
  () => [props.src, props.previewSrc, props.kind] as const,
  () => {
    const wasActive = active.value;
    reset();
    savedTime = 0;
    userOverrodePlayback = false;
    wantsPlayback.value = props.autoplay;
    if (wasActive) enterViewport();
  },
);

watch(active, async (value) => {
  if (!value) return;
  await nextTick();
  if (previewEl.value?.complete && previewEl.value.naturalWidth > 0) {
    void armImage('preview', previewEl.value);
  }
});

watch(finalRequested, async (value) => {
  if (!value) return;
  await nextTick();
  if (props.kind === 'image') {
    if (imageEl.value?.complete && imageEl.value.naturalWidth > 0) {
      void armImage('media', imageEl.value);
    }
  } else if (
    (videoEl.value?.readyState ?? 0) >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    arm('media');
  }
});

watch(
  () => props.autoplay,
  (value) => {
    wantsPlayback.value = value;
    userOverrodePlayback = false;
    if (value) void play();
    else pause();
  },
);

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    enterViewport();
    return;
  }
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) enterViewport();
      else leaveViewport();
    },
    { threshold: 0.01 },
  );
  if (rootEl.value) observer.observe(rootEl.value);
});

onUnmounted(() => {
  observer?.disconnect();
  reset();
});

defineExpose({ play, pause });
</script>

<template>
  <div
    ref="rootEl"
    v-bind="attrs"
    class="relative isolate overflow-hidden"
    :class="{ 'media-loading': loading }"
    :data-media-active="active"
    :data-media-preview-state="previewPhase"
    :data-media-final-state="mediaPhase"
    :style="rootStyle"
  >
    <span
      class="absolute inset-0 z-0 transition-opacity motion-reduce:duration-150"
      :class="[
        fastPreview ? 'duration-150' : 'duration-300',
        { 'opacity-0': previewPhase === 'visible' },
      ]"
      :style="{ backgroundColor: accentColor }"
      aria-hidden="true"
    />

    <img
      v-if="active && backdrop"
      :key="`backdrop:${resolvedPreviewSrc}`"
      :src="resolvedPreviewSrc"
      alt=""
      draggable="false"
      class="media-backdrop absolute inset-0 z-10 size-full object-cover
        opacity-0 transition-opacity motion-reduce:duration-150"
      :class="[
        fastPreview ? 'duration-150' : 'duration-300',
        { 'opacity-100': previewPhase === 'visible' },
      ]"
      aria-hidden="true"
    />

    <img
      v-if="active"
      ref="previewEl"
      :key="`preview:${resolvedPreviewSrc}`"
      :src="resolvedPreviewSrc"
      alt=""
      draggable="false"
      class="absolute z-20 opacity-0 transition-opacity
        motion-reduce:duration-150"
      :class="[
        mediaClass,
        fastPreview ? 'duration-150' : 'duration-300',
        { 'opacity-100': previewPhase === 'visible' },
      ]"
      :style="naturalStyle"
      @load="armImage('preview', previewEl)"
      @error="onError('preview')"
    />

    <img
      v-if="active && finalRequested && kind === 'image'"
      ref="imageEl"
      :key="`image:${src}`"
      :src
      :alt
      draggable="false"
      :width
      :height
      class="absolute z-30 opacity-0 transition-opacity
        motion-reduce:duration-150"
      :class="[
        mediaClass,
        fastMedia ? 'duration-150' : 'duration-300',
        { 'opacity-100': mediaPhase === 'visible' },
      ]"
      :style="naturalStyle"
      @load="armImage('media', imageEl)"
      @error="onError('media')"
    />

    <video
      v-if="active && finalRequested && kind === 'video'"
      ref="videoEl"
      :key="`video:${src}`"
      :src
      :muted="muted || autoplay"
      :loop
      :controls
      playsinline
      preload="metadata"
      class="absolute z-30 opacity-0 transition-opacity
        motion-reduce:duration-150"
      :class="[
        mediaClass,
        fastMedia ? 'duration-150' : 'duration-300',
        { 'opacity-100': mediaPhase === 'visible' },
      ]"
      :style="naturalStyle"
      @loadeddata="onVideoLoaded"
      @play="onVideoPlay"
      @pause="onVideoPause"
      @error="onError('media')"
    />
  </div>
</template>

<style scoped>
.media-loading {
  /* The alternating brightness pulse is specific to progressive media loading. */
  animation: media-pulse 1.15s ease-in-out infinite alternate;
}

.media-loading::before {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: linear-gradient(
    115deg,
    color-mix(in oklch, var(--media-accent) 45%, transparent),
    color-mix(in oklch, var(--media-accent) 82%, var(--color-bg-2)),
    color-mix(in oklch, var(--media-accent) 36%, transparent)
  );
  background-size: 220% 100%;
  content: '';
  animation: media-gradient 1.7s ease-in-out infinite;
}

.media-backdrop {
  filter: blur(1.5rem) saturate(0.72) brightness(0.68);
  transform: scale(1.12);
}

.media-natural-size {
  top: 50%;
  left: 50%;
  max-width: 100%;
  max-height: 100%;
  transform: translate(-50%, -50%);
}

@keyframes media-pulse {
  from {
    filter: brightness(0.88);
  }
  to {
    filter: brightness(1.12);
  }
}

@keyframes media-gradient {
  from {
    background-position: 100% 50%;
  }
  to {
    background-position: 0 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-loading {
    animation: none;
  }

  .media-loading::before {
    animation: none;
  }
}
</style>
