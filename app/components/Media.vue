<script lang="ts" setup>
import type { MediaKind } from '#layers/thei/shared/media';

defineOptions({ inheritAttrs: false });

type Phase = 'idle' | 'loading' | 'armed' | 'visible' | 'error';

const props = withDefaults(
  defineProps<{
    src: string;
    kind?: MediaKind;
    previewSrc?: string;
    accentHue?: number;
    width?: number;
    height?: number;
    autoplay?: boolean;
    alt?: string;
  }>(),
  {
    kind: 'image',
    autoplay: false,
    alt: '',
  },
);

const attrs = useAttrs();
const rootEl = useTemplateRef<HTMLElement>('rootEl');
const previewEl = useTemplateRef<HTMLImageElement>('previewEl');
const imageEl = useTemplateRef<HTMLImageElement>('imageEl');
const videoEl = useTemplateRef<HTMLVideoElement>('videoEl');
const active = ref(false);
const previewPhase = ref<Phase>('idle');
const mediaPhase = ref<Phase>('idle');
const finalRequested = ref(false);
const wantsPlayback = ref(props.autoplay);
let observer: IntersectionObserver | undefined;
let generation = 0;
let frames: number[] = [];
let previewTimer: ReturnType<typeof setTimeout> | undefined;

const resolvedPreviewSrc = computed(() => props.previewSrc || props.src);
const hasSeparateFinal = computed(
  () => props.kind === 'video' || resolvedPreviewSrc.value !== props.src,
);
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

function cancelPending() {
  frames.forEach(cancelAnimationFrame);
  frames = [];
  clearTimeout(previewTimer);
  previewTimer = undefined;
}

function reset() {
  generation++;
  cancelPending();
  videoEl.value?.pause();
  active.value = false;
  finalRequested.value = false;
  previewPhase.value = 'idle';
  mediaPhase.value = 'idle';
  wantsPlayback.value = props.autoplay;
}

function enterViewport() {
  if (active.value) return;
  generation++;
  cancelPending();
  active.value = true;
  previewPhase.value = 'loading';
  mediaPhase.value = 'idle';
  finalRequested.value = false;
  wantsPlayback.value = props.autoplay;
}

function leaveViewport() {
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
        previewTimer = setTimeout(() => {
          if (!active.value || generation !== currentGeneration) return;
          if (
            hasSeparateFinal.value &&
            (props.kind === 'image' || wantsPlayback.value)
          ) {
            requestFinal();
          }
        }, 240);
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
  arm(layer);
}

function requestFinal() {
  if (!active.value || finalRequested.value) return;
  finalRequested.value = true;
  mediaPhase.value = 'loading';
}

function onError(layer: 'preview' | 'media') {
  if (layer === 'preview') previewPhase.value = 'error';
  else mediaPhase.value = 'error';
}

async function play() {
  if (props.kind !== 'video') return;
  wantsPlayback.value = true;
  if (active.value && previewPhase.value === 'visible') requestFinal();
  if (mediaPhase.value === 'visible') {
    await videoEl.value?.play().catch(() => {});
  }
}

function pause() {
  wantsPlayback.value = false;
  const video = videoEl.value;
  if (!video) return;
  video.pause();
  video.currentTime = 0;
}

watch(
  () => [props.src, props.previewSrc, props.kind] as const,
  () => {
    const wasActive = active.value;
    reset();
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
    :style="{ backgroundColor: accentColor }"
    :data-media-active="active"
    :data-media-preview-state="previewPhase"
    :data-media-final-state="mediaPhase"
  >
    <img
      v-if="active"
      ref="previewEl"
      :key="`preview:${resolvedPreviewSrc}`"
      :src="resolvedPreviewSrc"
      alt=""
      draggable="false"
      class="absolute inset-0 size-full object-cover opacity-0
        transition-opacity duration-300 motion-reduce:duration-150"
      :class="{ 'opacity-100': previewPhase === 'visible' }"
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
      class="absolute inset-0 size-full object-cover opacity-0
        transition-opacity duration-300 motion-reduce:duration-150"
      :class="{ 'opacity-100': mediaPhase === 'visible' }"
      @load="armImage('media', imageEl)"
      @error="onError('media')"
    />

    <video
      v-if="active && finalRequested && kind === 'video'"
      ref="videoEl"
      :key="`video:${src}`"
      :src
      muted
      loop
      playsinline
      preload="auto"
      class="absolute inset-0 size-full object-cover opacity-0
        transition-opacity duration-300 motion-reduce:duration-150"
      :class="{ 'opacity-100': mediaPhase === 'visible' }"
      @loadeddata="arm('media')"
      @error="onError('media')"
    />
  </div>
</template>

<style scoped>
.media-loading {
  /* The alternating brightness pulse is specific to progressive media loading. */
  animation: media-pulse 1.15s ease-in-out infinite alternate;
}

@keyframes media-pulse {
  from {
    filter: brightness(0.88);
  }
  to {
    filter: brightness(1.12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-loading {
    animation: none;
  }
}
</style>
